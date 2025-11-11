import axios from "axios";


/**
 * Retrieves the App Store track ID for a given iOS app bundle identifier.
 *
 * Makes a request to the iTunes Search API to look up the app by its bundle ID.
 * If the app is found, returns its `trackId` (App Store ID). Returns `null` if
 * the app is not found or if an error occurs during the request.
 *
 * @param {string} bundleId - The bundle identifier of the iOS app.
 * @return {Promise<string | null>} A promise that resolves to the App Store track ID as a string, or `null` if not found.
 */
export async function getAppStoreID(bundleId: string): Promise<string | null> {
    try {
        const response = await axios.get(`https://itunes.apple.com/lookup?bundleId=${bundleId}&country=IN`);
        if (response.data && response.data.results.length > 0) {
            const appInfo = response.data.results[0];
            return appInfo.trackId;
        }

        return null;
    } catch (error) {
        return null;
    }
}

