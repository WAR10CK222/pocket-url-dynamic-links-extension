import { buildClickUpdates, ClickEvent, latencyBucket, safeKey, utmHash } from "../../src/data/analytics.repo";
import { dateKey } from "../../src/common/dates";
import { decodeKey } from "../../src/common/utils/dbKeys";

const INC = { inc: 1 };
const TS = { ts: true };
const event = (overrides: Partial<ClickEvent> = {}): ClickEvent => ({
    timestamp: Date.UTC(2026, 9, 15, 12),
    referrer: "news.example.com",
    platform: "ios",
    deviceType: "mobile",
    os: "iOS",
    browser: "Mobile Safari",
    country: "IN",
    city: "Pune",
    region: "MH",
    utmParams: { utm_source: "", utm_medium: "", utm_campaign: "" },
    source: "web",
    ...overrides,
});

describe("buildClickUpdates", () => {
    it("writes counters, the raw event, daily stats and latency in one update", () => {
        const updates = buildClickUpdates("promo", event(), "click1", 42, INC, TS);
        expect(updates["analytics/promo/totalClicks"]).toBe(INC);
        expect(updates["analytics/promo/clickByDate/20261015"]).toBe(INC);
        expect(updates["analytics/promo/referrers/news%2Eexample%2Ecom/value"]).toBe("news.example.com");
        expect(updates["analytics/promo/referrers/news%2Eexample%2Ecom/clickCount"]).toBe(INC);
        expect(updates["analytics/promo/geolocations/country/IN"]).toBe(INC);
        expect(updates["analytics/promo/updateTimestamp"]).toBe(TS);
        expect(updates["clicks/20261015/promo/click1"]).toEqual(event());
        expect(updates["stats/daily/20261015/clicks"]).toBe(INC);
        expect(updates["stats/daily/20261015/links/promo"]).toBe(INC);
        expect(updates["ops/daily/20261015/latency/lt50"]).toBe(INC);
        expect(Object.keys(updates).some((key) => key.includes("utmData"))).toBe(false);
    });

    it("records UTM params under a stable hash", () => {
        const utm = { utm_source: "mail", utm_medium: "email", utm_campaign: "spring" };
        const updates = buildClickUpdates("promo", event({ utmParams: utm }), "c", 10, INC, TS);
        expect(updates[`analytics/promo/utmData/${utmHash(utm)}/utmParams`]).toEqual(utm);
    });

    it("never produces paths with a path and its ancestor (RTDB would reject it)", () => {
        const keys = Object.keys(buildClickUpdates("p", event({ utmParams: { utm_source: "a", utm_medium: "", utm_campaign: "" } }), "c", 5, INC, TS));
        for (const key of keys) {
            expect(keys.some((other) => other !== key && other.startsWith(`${key}/`))).toBe(false);
        }
    });
});

describe("helpers", () => {
    it("buckets latency", () => {
        expect(latencyBucket(10)).toBe("lt50");
        expect(latencyBucket(50)).toBe("lt100");
        expect(latencyBucket(999)).toBe("lt1000");
        expect(latencyBucket(5000)).toBe("gte1000");
    });

    it("makes database-safe keys", () => {
        expect(safeKey("a.b#c$d/e[f]%")).toBe("a%2Eb%23c%24d%2Fe%5Bf%5D%25");
        expect(decodeKey(safeKey("a.b#c$d/e[f]%"))).toBe("a.b#c$d/e[f]%");
        expect(decodeKey("www_instagram_com")).toBe("www_instagram_com"); // legacy keys pass through
        expect(decodeKey("100%41")).toBe("100%41"); // only reserved characters decode
        expect(safeKey("")).toBe("Unknown");
        expect(safeKey("x".repeat(500))).toHaveLength(200);
    });

    it("formats UTC day keys", () => {
        expect(dateKey(Date.UTC(2026, 0, 2, 23, 59))).toBe("20260102");
    });
});
