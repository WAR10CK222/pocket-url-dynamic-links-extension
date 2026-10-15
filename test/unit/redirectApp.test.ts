import { AddressInfo } from "net";
import { Server } from "http";
import { setContextForTests, Context } from "../../src/context";
import { LinkRecord } from "../../src/data/schema";
import { createRedirectApp } from "../../src/redirect/app";
import { clearLinkCache } from "../../src/redirect/handler";
import { testConfig } from "../helpers";

const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CHROME_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TWITTERBOT = "Twitterbot/1.0";

const links: Record<string, LinkRecord> = {
    promo: { redirectUrl: "https://acme.com/promo", og: { title: "Spring <sale>" } },
    store: { redirectUrl: "https://acme.com/item/1", redirectToStore: true },
    off: { redirectUrl: "https://acme.com", disabled: true },
    quiet: { redirectUrl: "https://acme.com/q", preview: true },
};

const recorded: string[] = [];
let server: Server;
let base: string;

beforeAll(async () => {
    setContextForTests({
        config: testConfig(),
        db: {} as Context["db"],
        links: { get: async (slug: string) => links[slug] ?? null } as unknown as Context["links"],
        analytics: {
            recordClick: async (slug: string) => {
                recorded.push(`click:${slug}`);
            },
            recordBot: async (slug: string) => {
                recorded.push(`bot:${slug}`);
            },
            recordNotFound: async (slug: string, isBot: boolean) => {
                recorded.push(`404:${slug}:${isBot}`);
            },
            recordError: async () => {
                recorded.push("error");
            },
        } as unknown as Context["analytics"],
    });
    server = createRedirectApp().listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
    server.close();
    setContextForTests(null);
});

beforeEach(() => {
    recorded.length = 0;
    clearLinkCache();
});

const get = (path: string, userAgent = CHROME_DESKTOP, method = "GET") =>
    fetch(`${base}${path}`, { method, redirect: "manual", headers: { "user-agent": userAgent } });

describe("redirect app", () => {
    it("302s humans to the destination without caching and counts the click", async () => {
        const res = await get("/promo");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("https://acme.com/promo");
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(recorded).toEqual(["click:promo"]);
    });

    it("serves the OG preview to bots and counts them separately", async () => {
        const res = await get("/promo", TWITTERBOT);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("Spring &lt;sale&gt;");
        expect(recorded).toEqual(["bot:promo"]);
    });

    it("shows the app interstitial on iOS for store links", async () => {
        const res = await get("/store", SAFARI_IOS);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("\"mode\":\"interstitial\"");
        expect(html).toContain("https://apps.apple.com/app/id1234567890");
    });

    it("404s disabled and unknown links with no-store, recording the miss", async () => {
        const off = await get("/off");
        expect(off.status).toBe(404);
        expect(off.headers.get("cache-control")).toBe("private, no-store");
        await get("/nope");
        expect(recorded).toEqual(["404:off:false", "404:nope:false"]);
    });

    it("doesn't count HEAD requests or preview links", async () => {
        expect((await get("/promo", CHROME_DESKTOP, "HEAD")).status).toBe(302);
        expect((await get("/quiet")).status).toBe(302);
        expect(recorded).toEqual([]);
    });

    it("redirects the root to the site and serves association files", async () => {
        const root = await get("/");
        expect(root.status).toBe(302);
        expect(root.headers.get("location")).toBe("https://acme.com");
        const assetlinks = await get("/.well-known/assetlinks.json");
        expect(Array.isArray(await assetlinks.json())).toBe(true);
        const aasa = await get("/.well-known/apple-app-site-association");
        expect(aasa.headers.get("content-type")).toContain("application/json");
    });

    it("resolves links for apps as JSON and counts an app click", async () => {
        const res = await get("/_/resolve/promo?utm_source=app");
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ slug: "promo", url: "https://acme.com/promo" });
        expect(recorded).toEqual(["click:promo"]);
        expect((await get("/_/resolve/promo?count=0")).status).toBe(200);
        expect(recorded).toEqual(["click:promo"]);
    });

    it("404s deeper paths", async () => {
        expect((await get("/a/b/c")).status).toBe(404);
    });
});
