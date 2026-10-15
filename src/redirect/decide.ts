import { AppConfig } from "../config";
import { isHttpUrl, LinkRecord } from "../data/schema";
import { Platform } from "./userAgent";

export interface DecideContext {
    isBot: boolean;
    platform: Platform;
    inAppBrowser: boolean;
    /** The short link's own query string, without the leading "?". */
    query: URLSearchParams;
    now: number;
    /** Resolved App Store ID, if the iOS app has one. */
    appStoreId: string;
}

export type Decision =
    | { kind: "notFound"; reason: "missing" | "disabled" | "expired" }
    /** Crawlers and unfurlers: render the preview card and don't redirect. */
    | { kind: "preview"; destination: string }
    | { kind: "redirect"; location: string }
    /** App-aware page: try the app, then fall back to the store or a fallback URL. */
    | {
        kind: "interstitial";
        platform: "ios" | "android";
        appUrl: string;
        fallbackUrl: string;
        destination: string;
        autoRedirect: boolean;
    };

/** Adds the incoming query parameters to `url`; incoming values win on conflicts. */
export function withQuery(url: string, query: URLSearchParams): string {
    if ([...query.keys()].length === 0) return url;
    const target = new URL(url);
    query.forEach((value, key) => target.searchParams.set(key, value));
    return target.toString();
}

/** The destination re-hosted on the app's link domain, so installed apps can claim it. */
export function appLinkUrl(destination: string, appLinkHost: string): string {
    if (!appLinkHost) return destination;
    const url = new URL(destination);
    return `https://${appLinkHost}${url.pathname}${url.search}${url.hash}`;
}

export function needsAppStoreLookup(link: LinkRecord | null, platform: Platform, config: AppConfig): boolean {
    return Boolean(link?.redirectToStore && platform === "ios" && config.ios && !config.ios.appStoreId);
}

/**
 * Decides what a request for a short link should get. Pure: no I/O, so the whole
 * matrix (bot / iOS / Android / desktop × link options) is unit-testable.
 */
export function decide(link: LinkRecord | null, ctx: DecideContext, config: AppConfig): Decision {
    if (!link) return { kind: "notFound", reason: "missing" };
    if (link.disabled) return { kind: "notFound", reason: "disabled" };
    if (typeof link.expireAt === "number" && ctx.now >= link.expireAt) {
        return { kind: "notFound", reason: "expired" };
    }

    const base = isHttpUrl(link.redirectUrl) ? link.redirectUrl : config.siteUrl;
    const destination = link.forwardQuery ? withQuery(base, ctx.query) : base;
    if (ctx.isBot) return { kind: "preview", destination };

    const pick = (candidate: string | null | undefined) => (isHttpUrl(candidate) ? candidate : destination);

    if (ctx.platform === "ios") {
        if (link.redirectToStore && config.ios) {
            const storeUrl = ctx.appStoreId ? `https://apps.apple.com/app/id${ctx.appStoreId}` : destination;
            return {
                kind: "interstitial",
                platform: "ios",
                appUrl: appLinkUrl(destination, config.appLinkHost),
                fallbackUrl: pick(link.iosFallbackUrl ?? storeUrl),
                destination,
                // If this page loaded in Safari, universal links already had their chance:
                // the app isn't installed, so go straight to the fallback. In-app browsers
                // never trigger universal links, so let the user choose there.
                autoRedirect: !ctx.inAppBrowser,
            };
        }
        return { kind: "redirect", location: pick(link.iosFallbackUrl) };
    }

    if (ctx.platform === "android") {
        if (link.redirectToStore && config.android) {
            const { packageName, scheme } = config.android;
            const storeUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`;
            const fallbackUrl = pick(link.androidFallbackUrl ?? storeUrl);
            const target = new URL(appLinkUrl(destination, config.appLinkHost));
            const appUrl = `intent://${target.host}${target.pathname}${target.search}` +
                `#Intent;scheme=${scheme};package=${packageName};` +
                `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
            return { kind: "interstitial", platform: "android", appUrl, fallbackUrl, destination, autoRedirect: true };
        }
        return { kind: "redirect", location: pick(link.androidFallbackUrl) };
    }

    return { kind: "redirect", location: pick(link.desktopUrl) };
}
