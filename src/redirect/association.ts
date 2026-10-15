import { AppConfig } from "../config";

/** Paths on the short domain that must never open the app. */
const EXCLUDED_PREFIXES = ["/admin/", "/api/", "/images/", "/_/"];

/**
 * apple-app-site-association for the short-link domain, claiming every short
 * link for the iOS app. Includes both the legacy `appID`/`paths` keys and the
 * iOS 13+ `appIDs`/`components` keys. Returns null when iOS isn't configured.
 */
export function appleAppSiteAssociation(config: AppConfig): object | null {
    if (!config.ios || !config.ios.teamId) return null;
    const appId = `${config.ios.teamId}.${config.ios.bundleId}`;
    return {
        applinks: {
            apps: [],
            details: [
                {
                    appID: appId,
                    appIDs: [appId],
                    paths: [...EXCLUDED_PREFIXES.map((prefix) => `NOT ${prefix}*`), "*"],
                    components: [
                        ...EXCLUDED_PREFIXES.map((prefix) => ({ "/": `${prefix}*`, "exclude": true })),
                        { "/": "/*" },
                    ],
                },
            ],
        },
        webcredentials: { apps: [appId] },
    };
}

/**
 * Digital Asset Links statement list. This must be a JSON array; the 0.0.x
 * version returned a bare object, which Android rejects.
 */
export function assetLinks(config: AppConfig): object[] | null {
    if (!config.android || config.android.sha256Fingerprints.length === 0) return null;
    return [
        {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
                namespace: "android_app",
                package_name: config.android.packageName,
                sha256_cert_fingerprints: config.android.sha256Fingerprints,
            },
        },
    ];
}

export const ROBOTS_TXT = "User-agent: *\nDisallow: /admin/\nDisallow: /api/\nDisallow: /_/\n";
