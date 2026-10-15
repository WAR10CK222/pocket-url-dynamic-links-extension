const cache = new Map<string, { id: string; expiresAt: number }>();
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;

/**
 * Retrieves the App Store track ID for a given iOS app bundle identifier.
 *
 * Prefer configuring IOS_APP_STORE_ID; this lookup is only a fallback. It calls the
 * iTunes Search API (default storefront), caches the result per server instance,
 * and returns an empty string when the app can't be found or the call fails.
 *
 * @param {string} bundleId - The bundle identifier of the iOS app.
 * @return {Promise<string>} The App Store ID, or "" if not found.
 */
export async function getAppStoreID(bundleId: string): Promise<string> {
    if (!bundleId) return "";
    const cached = cache.get(bundleId);
    if (cached && cached.expiresAt > Date.now()) return cached.id;

    let id = "";
    try {
        const response = await fetch(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`, {
            signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
            const data = (await response.json()) as { results?: Array<{ trackId?: number }> };
            const trackId = data.results?.[0]?.trackId;
            if (trackId) id = String(trackId);
        }
    } catch {
        id = "";
    }
    cache.set(bundleId, { id, expiresAt: Date.now() + (id ? SUCCESS_TTL_MS : FAILURE_TTL_MS) });
    return id;
}
