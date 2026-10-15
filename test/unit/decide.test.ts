import { decide, DecideContext, withQuery } from "../../src/redirect/decide";
import { LinkRecord } from "../../src/data/schema";
import { testConfig } from "../helpers";

const config = testConfig();
const ctx = (overrides: Partial<DecideContext> = {}): DecideContext => ({
    isBot: false,
    platform: "desktop",
    inAppBrowser: false,
    query: new URLSearchParams(),
    now: 1_000_000,
    appStoreId: "1234567890",
    ...overrides,
});
const link = (overrides: Partial<LinkRecord> = {}): LinkRecord => ({ redirectUrl: "https://acme.com/article/42?ref=x", ...overrides });

describe("decide", () => {
    it("returns notFound for missing, disabled and expired links", () => {
        expect(decide(null, ctx(), config)).toEqual({ kind: "notFound", reason: "missing" });
        expect(decide(link({ disabled: true }), ctx(), config)).toEqual({ kind: "notFound", reason: "disabled" });
        expect(decide(link({ expireAt: 1_000_000 }), ctx(), config)).toEqual({ kind: "notFound", reason: "expired" });
        expect(decide(link({ expireAt: 1_000_001 }), ctx(), config).kind).toBe("redirect");
    });

    it("serves a preview to bots", () => {
        expect(decide(link(), ctx({ isBot: true, platform: "ios" }), config))
            .toEqual({ kind: "preview", destination: "https://acme.com/article/42?ref=x" });
    });

    it("redirects humans server-side when the link has no app behaviour", () => {
        expect(decide(link(), ctx(), config)).toEqual({ kind: "redirect", location: "https://acme.com/article/42?ref=x" });
        expect(decide(link(), ctx({ platform: "ios" }), config).kind).toBe("redirect");
        expect(decide(link(), ctx({ platform: "android" }), config).kind).toBe("redirect");
    });

    it("uses per-platform fallback URLs", () => {
        const l = link({ desktopUrl: "https://acme.com/desktop", iosFallbackUrl: "https://acme.com/ios", androidFallbackUrl: "https://acme.com/android" });
        expect(decide(l, ctx(), config)).toEqual({ kind: "redirect", location: "https://acme.com/desktop" });
        expect(decide(l, ctx({ platform: "ios" }), config)).toEqual({ kind: "redirect", location: "https://acme.com/ios" });
        expect(decide(l, ctx({ platform: "android" }), config)).toEqual({ kind: "redirect", location: "https://acme.com/android" });
    });

    it("ignores invalid fallback URLs and an invalid destination", () => {
        expect(decide(link({ desktopUrl: "javascript:alert(1)" }), ctx(), config))
            .toEqual({ kind: "redirect", location: "https://acme.com/article/42?ref=x" });
        expect(decide(link({ redirectUrl: "" }), ctx(), config)).toEqual({ kind: "redirect", location: "https://acme.com" });
    });

    it("sends iOS store links to the App Store, letting in-app browsers choose", () => {
        const decision = decide(link({ redirectToStore: true }), ctx({ platform: "ios" }), config);
        expect(decision).toEqual({
            kind: "interstitial",
            platform: "ios",
            appUrl: "https://acme.com/article/42?ref=x",
            fallbackUrl: "https://apps.apple.com/app/id1234567890",
            destination: "https://acme.com/article/42?ref=x",
            autoRedirect: true,
        });
        const inApp = decide(link({ redirectToStore: true }), ctx({ platform: "ios", inAppBrowser: true }), config);
        expect(inApp.kind === "interstitial" && inApp.autoRedirect).toBe(false);
    });

    it("re-hosts the app link on the site's host", () => {
        const decision = decide(link({ redirectUrl: "https://www.other.com/p?q=1", redirectToStore: true }), ctx({ platform: "ios" }), config);
        expect(decision.kind === "interstitial" && decision.appUrl).toBe("https://acme.com/p?q=1");
    });

    it("builds an Android intent URL with the Play Store fallback", () => {
        const decision = decide(link({ redirectToStore: true }), ctx({ platform: "android" }), config);
        expect(decision.kind).toBe("interstitial");
        if (decision.kind !== "interstitial") return;
        expect(decision.appUrl).toBe(
            "intent://acme.com/article/42?ref=x#Intent;scheme=https;package=com.acme.app;" +
            `S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=com.acme.app")};end`);
        expect(decision.autoRedirect).toBe(true);
    });

    it("falls back to a plain redirect when the platform app isn't configured", () => {
        const noApps = testConfig({ iosBundleId: "", androidPackage: "" });
        expect(decide(link({ redirectToStore: true }), ctx({ platform: "ios" }), noApps).kind).toBe("redirect");
        expect(decide(link({ redirectToStore: true }), ctx({ platform: "android" }), noApps).kind).toBe("redirect");
    });

    it("forwards the query string only when asked to", () => {
        const query = new URLSearchParams("utm_source=mail&ref=override");
        expect(decide(link(), ctx({ query }), config))
            .toEqual({ kind: "redirect", location: "https://acme.com/article/42?ref=x" });
        expect(decide(link({ forwardQuery: true }), ctx({ query }), config))
            .toEqual({ kind: "redirect", location: "https://acme.com/article/42?ref=override&utm_source=mail" });
    });
});

describe("withQuery", () => {
    it("returns the URL untouched when there is no query", () => {
        expect(withQuery("https://a.com/x?y=1", new URLSearchParams())).toBe("https://a.com/x?y=1");
    });
});
