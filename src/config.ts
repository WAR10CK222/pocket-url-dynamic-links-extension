import { params } from "./params";

export interface IosAppConfig {
    bundleId: string;
    teamId: string;
    appStoreId: string;
}

export interface AndroidAppConfig {
    packageName: string;
    sha256Fingerprints: string[];
    scheme: string;
}

export interface AppConfig {
    hostingSiteId: string;
    siteName: string;
    siteUrl: string;
    /** Host that app (universal) links are built on, derived from SITE_URL. */
    appLinkHost: string;
    adminEmails: string[];
    customDomain: string;
    /** Domain short links are shared on: the custom domain, or <site>.web.app. */
    shortDomain: string;
    rtdbUrl: string;
    databasePath: string;
    ios: IosAppConfig | null;
    android: AndroidAppConfig | null;
    twitterHandle: string;
    siteKeywords: string;
    siteIconUrl: string;
    themeColor: string;
    webApiKey: string;
    clickRetentionDays: number;
    linkCacheSeconds: number;
    autoAuthorizeDomains: boolean;
}

const splitList = (value: string): string[] =>
    value.split(",").map((item) => item.trim()).filter(Boolean);

/** Builds the config from raw values; exported separately so tests don't need params. */
export function buildConfig(raw: {
    hostingSiteId: string;
    siteName: string;
    siteUrl: string;
    adminEmails: string;
    customDomain?: string;
    rtdbUrl?: string;
    databasePath?: string;
    iosBundleId?: string;
    iosTeamId?: string;
    iosAppStoreId?: string;
    androidPackage?: string;
    androidSha256?: string;
    androidScheme?: string;
    twitterHandle?: string;
    siteKeywords?: string;
    siteIconUrl?: string;
    themeColor?: string;
    webApiKey?: string;
    clickRetentionDays?: number;
    linkCacheSeconds?: number;
    autoAuthorizeDomains?: boolean;
}): AppConfig {
    const siteUrl = raw.siteUrl.trim().replace(/\/+$/, "");
    let appLinkHost = "";
    try {
        appLinkHost = new URL(siteUrl).host;
    } catch {
        appLinkHost = "";
    }
    const customDomain = (raw.customDomain ?? "").trim().toLowerCase();
    const iosBundleId = (raw.iosBundleId ?? "").trim();
    const androidPackage = (raw.androidPackage ?? "").trim();

    return {
        hostingSiteId: raw.hostingSiteId.trim(),
        siteName: raw.siteName.trim(),
        siteUrl,
        appLinkHost,
        adminEmails: splitList(raw.adminEmails).map((email) => email.toLowerCase()),
        customDomain,
        shortDomain: customDomain || `${raw.hostingSiteId.trim()}.web.app`,
        rtdbUrl: (raw.rtdbUrl ?? "").trim().replace(/\/+$/, ""),
        databasePath: (raw.databasePath ?? "").trim().replace(/^\/+|\/+$/g, "") || "dynamicLinksV1",
        ios: iosBundleId ? {
            bundleId: iosBundleId,
            teamId: (raw.iosTeamId ?? "").trim(),
            appStoreId: (raw.iosAppStoreId ?? "").trim(),
        } : null,
        android: androidPackage ? {
            packageName: androidPackage,
            sha256Fingerprints: splitList(raw.androidSha256 ?? "").map((fp) => fp.toUpperCase()),
            scheme: (raw.androidScheme ?? "").trim() || "https",
        } : null,
        twitterHandle: (raw.twitterHandle ?? "").trim().replace(/^@+/, ""),
        siteKeywords: (raw.siteKeywords ?? "").trim(),
        siteIconUrl: (raw.siteIconUrl ?? "").trim(),
        // Inserted into a <style> block, where HTML escaping doesn't apply: accept hex only.
        themeColor: /^#[0-9a-fA-F]{6}$/.test((raw.themeColor ?? "").trim()) ? (raw.themeColor as string).trim() : "#031e45",
        webApiKey: (raw.webApiKey ?? "").trim(),
        clickRetentionDays: Number.isFinite(raw.clickRetentionDays) ? Math.max(1, raw.clickRetentionDays as number) : 90,
        linkCacheSeconds: Number.isFinite(raw.linkCacheSeconds) ? Math.max(0, raw.linkCacheSeconds as number) : 30,
        autoAuthorizeDomains: raw.autoAuthorizeDomains ?? true,
    };
}

/**
 * Deploys always write every param to the environment, but local runs may not;
 * `.value()` on an unset int/boolean param yields NaN/false rather than its default.
 */
function setOr<T>(name: string, read: () => T, fallback: T): T {
    const raw = process.env[name];
    return raw === undefined || raw.trim() === "" ? fallback : read();
}

let cached: AppConfig | null = null;

/** Resolves params once per server instance. Call only inside handlers. */
export function getConfig(): AppConfig {
    if (!cached) {
        cached = buildConfig({
            hostingSiteId: params.hostingSiteId.value(),
            siteName: params.siteName.value(),
            siteUrl: params.siteUrl.value(),
            adminEmails: params.adminEmails.value(),
            customDomain: params.customDomain.value(),
            rtdbUrl: params.rtdbUrl.value(),
            databasePath: params.databasePath.value(),
            iosBundleId: params.iosBundleId.value(),
            iosTeamId: params.iosTeamId.value(),
            iosAppStoreId: params.iosAppStoreId.value(),
            androidPackage: params.androidPackage.value(),
            androidSha256: params.androidSha256.value(),
            androidScheme: params.androidScheme.value(),
            twitterHandle: params.twitterHandle.value(),
            siteKeywords: params.siteKeywords.value(),
            siteIconUrl: params.siteIconUrl.value(),
            themeColor: params.themeColor.value(),
            webApiKey: params.webApiKey.value(),
            clickRetentionDays: setOr("CLICK_RETENTION_DAYS", () => params.clickRetentionDays.value(), 90),
            linkCacheSeconds: setOr("LINK_CACHE_SECONDS", () => params.linkCacheSeconds.value(), 30),
            autoAuthorizeDomains: setOr("AUTO_AUTHORIZE_DOMAINS", () => params.autoAuthorizeDomains.value(), true),
        });
    }
    return cached;
}

/** Test hook: override or reset the memoized config. */
export function setConfigForTests(config: AppConfig | null): void {
    cached = config;
}
