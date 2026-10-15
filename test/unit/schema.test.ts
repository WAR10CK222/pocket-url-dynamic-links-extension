import {
    compact,
    createLinkSchema,
    isHttpUrl,
    isValidSlug,
    normalizeLink,
    updateLinkSchema,
} from "../../src/data/schema";
import { generateSlug } from "../../src/data/slug";

describe("slugs", () => {
    it("generates base62 slugs of the requested length", () => {
        for (let i = 0; i < 50; i++) expect(generateSlug(7)).toMatch(/^[A-Za-z0-9]{7}$/);
    });

    it("rejects reserved and malformed slugs", () => {
        expect(isValidSlug("summer-sale_2026")).toBe(true);
        for (const slug of ["admin", "API", "images", "_", "a/b", "a.b", "", "x".repeat(65)]) {
            expect(isValidSlug(slug)).toBe(false);
        }
    });
});

describe("isHttpUrl", () => {
    it("accepts only http and https", () => {
        expect(isHttpUrl("https://acme.com/x")).toBe(true);
        expect(isHttpUrl("http://acme.com")).toBe(true);
        expect(isHttpUrl("javascript:alert(1)")).toBe(false);
        expect(isHttpUrl("data:text/html,hi")).toBe(false);
        expect(isHttpUrl("acme.com")).toBe(false);
        expect(isHttpUrl(undefined)).toBe(false);
    });
});

describe("createLinkSchema", () => {
    it("accepts a full link and normalizes empty optional URLs", () => {
        const parsed = createLinkSchema.parse({
            redirectUrl: "https://acme.com/a",
            slug: "promo",
            og: { title: "T", image: "" },
            desktopUrl: "",
            tags: ["spring"],
        });
        expect(parsed.slug).toBe("promo");
        expect(parsed.og?.image).toBeUndefined();
        expect(parsed.desktopUrl).toBeNull();
    });

    it("rejects unsafe destinations and unknown fields", () => {
        expect(createLinkSchema.safeParse({ redirectUrl: "javascript:alert(1)" }).success).toBe(false);
        expect(createLinkSchema.safeParse({ redirectUrl: "https://a.com", analytics: {} }).success).toBe(false);
        expect(createLinkSchema.safeParse({ redirectUrl: "https://a.com", slug: "admin" }).success).toBe(false);
    });

    it("allows partial updates and null to clear fields", () => {
        expect(updateLinkSchema.parse({ disabled: true })).toEqual({ disabled: true });
        expect(updateLinkSchema.parse({ expireAt: null, iosFallbackUrl: null })).toEqual({ expireAt: null, iosFallbackUrl: null });
    });
});

describe("normalizeLink", () => {
    it("reads the 0.0.x legacy shape", () => {
        const link = normalizeLink({
            "redirectUrl": "https://acme.com/a",
            "og:title": "Old title",
            "og:description": "Old desc",
            "redirectToStore": true,
            "expireAt": "2030-01-01T00:00:00Z",
            "analytics": { totalClicks: 5 },
            "log": { a: {} },
        });
        expect(link).toEqual({
            redirectUrl: "https://acme.com/a",
            og: { title: "Old title", description: "Old desc" },
            redirectToStore: true,
            expireAt: Date.parse("2030-01-01T00:00:00Z"),
        });
    });

    it("returns null for non-objects", () => {
        expect(normalizeLink(null)).toBeNull();
        expect(normalizeLink("x")).toBeNull();
    });
});

describe("compact", () => {
    it("drops undefined, and null unless kept", () => {
        expect(compact({ a: 1, b: undefined, c: null, d: { e: undefined } })).toEqual({ a: 1 });
        expect(compact({ a: null, d: { e: undefined } }, true)).toEqual({ a: null, d: null });
    });
});
