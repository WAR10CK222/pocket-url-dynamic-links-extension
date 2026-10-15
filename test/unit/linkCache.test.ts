import { TtlCache } from "../../src/redirect/linkCache";

describe("TtlCache", () => {
    it("caches until the TTL expires", async () => {
        let now = 0;
        const cache = new TtlCache<string>(10, () => now);
        let loads = 0;
        const load = async () => `v${++loads}`;
        expect(await cache.get("k", () => 1000, load)).toBe("v1");
        now = 999;
        expect(await cache.get("k", () => 1000, load)).toBe("v1");
        now = 1000;
        expect(await cache.get("k", () => 1000, load)).toBe("v2");
    });

    it("de-duplicates concurrent loads", async () => {
        const cache = new TtlCache<number>();
        let loads = 0;
        const load = () => new Promise<number>((resolve) => setTimeout(() => resolve(++loads), 5));
        const results = await Promise.all([1, 2, 3].map(() => cache.get("k", () => 1000, load)));
        expect(results).toEqual([1, 1, 1]);
        expect(loads).toBe(1);
    });

    it("doesn't cache when the TTL is zero, and evicts the oldest entry when full", async () => {
        const cache = new TtlCache<string>(2);
        let loads = 0;
        await cache.get("a", () => 0, async () => `${++loads}`);
        await cache.get("a", () => 0, async () => `${++loads}`);
        expect(loads).toBe(2);
        cache.set("x", "1", 1000);
        cache.set("y", "2", 1000);
        cache.set("z", "3", 1000);
        expect(await cache.get("x", () => 1000, async () => "reloaded")).toBe("reloaded");
    });
});
