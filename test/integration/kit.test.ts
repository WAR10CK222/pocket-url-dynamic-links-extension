import { Server } from "http";
import { AddressInfo } from "net";
import { getAuth } from "firebase-admin/auth";
import { createApiApp } from "../../src/api/app";
import { adminApp, getDb } from "../../src/common/clients/firebase";
import { addDays, dateKey } from "../../src/common/dates";
import { context } from "../../src/context";
import { migrateLegacyLayout } from "../../src/data/migrateLegacy";
import { runPrune } from "../../src/maintenance/prune";
import { createRedirectApp } from "../../src/redirect/app";

const ROOT = "integration";
const HUMAN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let apiServer: Server;
let redirectServer: Server;
let apiBase: string;
let redirectBase: string;
let adminToken: string;
let userToken: string;

async function listen(server: Server): Promise<string> {
    if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function idToken(email: string): Promise<string> {
    const auth = getAuth(adminApp());
    await auth.createUser({ email, password: "password123", emailVerified: true }).catch(() => undefined);
    const res = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "password123", returnSecureToken: true }) },
    );
    return ((await res.json()) as { idToken: string }).idToken;
}

/** API responses are loosely typed in tests: `.json()` resolves to the response envelope. */
type JsonResponse = Omit<Response, "json"> & { json(): Promise<any> };
const api = (path: string, init: RequestInit = {}, token = adminToken) => fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
}) as Promise<JsonResponse>;
const value = async (path: string) => (await getDb().ref(`${ROOT}/${path}`).get()).val();

beforeAll(async () => {
    await getDb().ref(ROOT).remove();
    adminToken = await idToken("admin@example.com");
    userToken = await idToken("someone@example.com");
    apiServer = createApiApp().listen(0);
    redirectServer = createRedirectApp().listen(0);
    apiBase = await listen(apiServer);
    redirectBase = await listen(redirectServer);
});

afterAll(() => {
    apiServer?.close();
    redirectServer?.close();
});

describe("admin API auth", () => {
    it("rejects missing tokens and non-admins, and reports /me", async () => {
        expect((await api("/links", {}, "")).status).toBe(401);
        expect((await api("/links", {}, userToken)).status).toBe(403);
        const me = await (await api("/me", {}, userToken)).json();
        expect(me.data).toMatchObject({ email: "someone@example.com", admin: false });
    });
});

describe("links lifecycle", () => {
    it("creates, rejects duplicates, lists, updates and resolves a link", async () => {
        const created = await api("/links", { method: "POST", body: JSON.stringify({ redirectUrl: "https://demo.example.com/a", slug: "spring", og: { title: "Spring" } }) });
        expect(created.status).toBe(201);
        expect((await created.json()).data).toMatchObject({ slug: "spring", shortUrl: "https://demo-links.web.app/spring", status: "active" });

        const duplicate = await api("/links", { method: "POST", body: JSON.stringify({ redirectUrl: "https://demo.example.com/b", slug: "spring" }) });
        expect(duplicate.status).toBe(409);

        const invalid = await api("/links", { method: "POST", body: JSON.stringify({ redirectUrl: "javascript:alert(1)" }) });
        expect(invalid.status).toBe(400);

        const generated = await (await api("/links", { method: "POST", body: JSON.stringify({ redirectUrl: "https://demo.example.com/c" }) })).json();
        expect(generated.data.slug).toMatch(/^[A-Za-z0-9]{7}$/);
        expect(await value("meta/linkCount")).toBe(2);

        const list = await (await api("/links?limit=10")).json();
        expect(list.data.links.map((link: { slug: string }) => link.slug)).toContain("spring");

        const patched = await (await api("/links/spring", { method: "PATCH", body: JSON.stringify({ og: { title: "Spring sale" } }) })).json();
        expect(patched.data.og.title).toBe("Spring sale");
    });

    it("counts human clicks with one write, bots separately, and records misses", async () => {
        const res = await fetch(`${redirectBase}/spring?utm_source=newsletter`, { redirect: "manual", headers: { "user-agent": HUMAN, "referer": "https://news.example.org/post" } });
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("https://demo.example.com/a");

        await fetch(`${redirectBase}/spring`, { redirect: "manual", headers: { "user-agent": "Slackbot-LinkExpanding 1.0" } });
        await fetch(`${redirectBase}/missing-slug`, { redirect: "manual", headers: { "user-agent": HUMAN } });

        const today = dateKey();
        expect(await value("analytics/spring/totalClicks")).toBe(1);
        expect(await value("analytics/spring/botClicks")).toBe(1);
        expect(await value("analytics/spring/referrers/news%2Eexample%2Eorg/clickCount")).toBe(1);
        expect(Object.keys(await value(`clicks/${today}/spring`))).toHaveLength(1);
        expect(await value(`stats/daily/${today}/clicks`)).toBe(1);
        expect(await value(`stats/daily/${today}/bots`)).toBe(1);
        expect(await value(`ops/daily/${today}/notFound/missing-slug`)).toBe(1);

        const overview = (await (await api("/stats/overview")).json()).data;
        expect(overview.totals).toMatchObject({ clicks: 1, bots: 1 });
        expect(overview.topLinks[0]).toMatchObject({ key: "spring", count: 1 });

        const stats = (await (await api("/links/spring/stats")).json()).data;
        expect(stats.totals).toEqual({ totalClicks: 1, botClicks: 1 });
        expect(stats.utm[0]).toMatchObject({ source: "newsletter", count: 1 });

        const clicks = (await (await api("/links/spring/clicks")).json()).data.clicks;
        expect(clicks[0]).toMatchObject({ referrer: "news.example.org", source: "web" });
        expect(clicks[0]).not.toHaveProperty("ip");
    });

    it("stops resolving disabled links", async () => {
        await api("/links/spring", { method: "PATCH", body: JSON.stringify({ disabled: true }) });
        const res = await fetch(`${redirectBase}/spring`, { redirect: "manual", headers: { "user-agent": HUMAN } });
        expect(res.status).toBe(404);
        expect(res.headers.get("cache-control")).toBe("private, no-store");
    });

    it("bulk-creates with per-row results", async () => {
        const res = await (await api("/links/batch", {
            method: "POST",
            body: JSON.stringify({ links: [{ redirectUrl: "https://demo.example.com/1", slug: "bulk-1" }, { redirectUrl: "nope" }] }),
        })).json();
        expect(res.data.created).toBe(1);
        expect(res.data.results[1]).toMatchObject({ index: 1, ok: false });
    });

    it("deletes links with their analytics", async () => {
        expect((await api("/links/spring", { method: "DELETE" })).status).toBe(200);
        expect(await value("links/spring")).toBeNull();
        expect(await value("analytics/spring")).toBeNull();
        expect((await api("/links/spring")).status).toBe(404);
    });
});

describe("legacy migration", () => {
    it("moves nested analytics and logs out of link nodes, merging with new counters", async () => {
        const root = "legacy";
        const today = dateKey();
        await getDb().ref(root).set({
            links: {
                old1: {
                    "redirectUrl": "https://demo.example.com/old",
                    "og:title": "Old",
                    "analytics": { totalClicks: 5, clickByDate: { [today]: 5 }, updateTimestamp: 123 },
                    "log": {
                        a: { referrer: "https://t.co/x", os: "iOS", date: today, timestamp: Date.now() },
                        b: { referrer: "direct", date: "20000101", timestamp: 946684800000 },
                    },
                },
                fresh: { redirectUrl: "https://demo.example.com/new" },
            },
            // A click recorded by the new code before the migration ran.
            analytics: { old1: { totalClicks: 2 } },
        });

        const result = await migrateLegacyLayout(getDb(), root, { retentionDays: 30, chunkSize: 1 });
        expect(result).toMatchObject({ migratedLinks: 1, linkCount: 2, skipped: false });

        const data = (await getDb().ref(root).get()).val();
        expect(data.links.old1).toEqual({ redirectUrl: "https://demo.example.com/old", og: { title: "Old" } });
        expect(data.analytics.old1.totalClicks).toBe(7);
        expect(data.analytics.old1.updateTimestamp).toBe(123);
        expect(data.clicks[today].old1.a).toMatchObject({ referrer: "t.co", os: "iOS" });
        expect(data.clicks["20000101"]).toBeUndefined(); // older than retention
        expect(data.meta.schemaVersion).toBe(2);

        expect((await migrateLegacyLayout(getDb(), root, { retentionDays: 30 })).skipped).toBe(true);
    });
});

describe("retention", () => {
    it("deletes click days older than the retention window", async () => {
        const today = dateKey();
        const old = addDays(today, -31);
        const recent = addDays(today, -29);
        const db = context().db;
        await db.ref(`${ROOT}/clicks/${old}/x/1`).set({ t: 1 });
        await db.ref(`${ROOT}/clicks/${recent}/x/1`).set({ t: 1 });
        await db.ref(`${ROOT}/meta/prunedThrough`).remove();

        await runPrune();
        expect(await value(`clicks/${old}`)).toBeNull();
        expect(await value(`clicks/${recent}/x/1`)).toEqual({ t: 1 });
        expect(await value("meta/prunedThrough/clicks")).toBe(addDays(today, -30));
    });
});
