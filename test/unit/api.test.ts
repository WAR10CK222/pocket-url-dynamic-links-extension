import { isAdmin } from "../../src/api/auth";
import { linkStatus } from "../../src/api/routes/links";
import { latencyPercentile, opsFromDaily, overviewFromDaily, summarizeUtm } from "../../src/api/summaries";
import { resolveRange } from "../../src/common/dates";

describe("isAdmin", () => {
    const allow = ["admin@acme.com"];
    it("allows verified allowlisted emails, case-insensitively", () => {
        expect(isAdmin({ uid: "1", email: "Admin@Acme.com", email_verified: true }, allow)).toBe(true);
    });
    it("rejects unverified or unlisted emails", () => {
        expect(isAdmin({ uid: "1", email: "admin@acme.com", email_verified: false }, allow)).toBe(false);
        expect(isAdmin({ uid: "1", email: "other@acme.com", email_verified: true }, allow)).toBe(false);
        expect(isAdmin({ uid: "1" }, allow)).toBe(false);
    });
    it("allows the custom claim regardless of email", () => {
        expect(isAdmin({ uid: "1", pocketUrlAdmin: true }, [])).toBe(true);
        expect(isAdmin({ uid: "1", pocketUrlAdmin: "true" }, [])).toBe(false);
    });
});

describe("linkStatus", () => {
    it("derives status", () => {
        expect(linkStatus({ redirectUrl: "x" }, 10)).toBe("active");
        expect(linkStatus({ redirectUrl: "x", disabled: true }, 10)).toBe("disabled");
        expect(linkStatus({ redirectUrl: "x", expireAt: 5 }, 10)).toBe("expired");
    });
});

describe("summaries", () => {
    it("builds an overview with zero-filled days and ranked top lists", () => {
        const overview = overviewFromDaily("20261001", "20261003", {
            "20261001": { clicks: 3, bots: 1, links: { a: 2, b: 1 }, countries: { IN: 3 } },
            "20261003": { clicks: 2, links: { b: 2 }, countries: { US: 2 } },
        });
        expect(overview.series).toEqual([
            { date: "20261001", clicks: 3, bots: 1 },
            { date: "20261002", clicks: 0, bots: 0 },
            { date: "20261003", clicks: 2, bots: 0 },
        ]);
        expect(overview.totals).toEqual({ clicks: 5, bots: 1, appResolves: 0 });
        expect(overview.topLinks.map((link) => [link.key, link.count])).toEqual([["b", 3], ["a", 2]]);
    });

    it("estimates latency percentiles from buckets", () => {
        expect(latencyPercentile({}, 0.5)).toBeNull();
        expect(latencyPercentile({ lt50: 90, lt250: 10 }, 0.5)).toBe(50);
        expect(latencyPercentile({ lt50: 90, lt250: 10 }, 0.95)).toBe(250);
        expect(latencyPercentile({ gte1000: 1 }, 0.95)).toBe(1000);
    });

    it("summarizes ops including uncategorized 404s", () => {
        const ops = opsFromDaily("20261001", "20261001", {
            "20261001": { errors: 2, notFound: { promo: 4 }, notFoundOther: 6, latency: { lt100: 1 } },
        });
        expect(ops.series).toEqual([{ date: "20261001", errors: 2, notFound: 10 }]);
        expect(ops.topNotFound[0]).toMatchObject({ key: "promo", count: 4 });
        expect(ops.latency.p50).toBe(100);
    });

    it("merges UTM rows with identical params", () => {
        const rows = summarizeUtm({
            old: { utmParams: { utm_source: "a", utm_medium: "b", utm_campaign: "c" }, clickCount: 2 },
            new: { utmParams: { utm_source: "a", utm_medium: "b", utm_campaign: "c" }, clickCount: 3 },
        });
        expect(rows).toEqual([{ source: "a", medium: "b", campaign: "c", count: 5 }]);
    });

    it("resolves and clamps date ranges", () => {
        expect(resolveRange("20261010", "20261001")).toEqual({ from: "20261001", to: "20261001" });
        expect(resolveRange("20200101", "20261001", 30, 7)).toEqual({ from: "20260925", to: "20261001" });
        expect(resolveRange(undefined, "20261030", 3)).toEqual({ from: "20261028", to: "20261030" });
    });
});
