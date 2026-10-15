import { withRetry } from "./gcp";
import { HostingFile } from "./files";
import { HostingClient } from "./hostingClient";

const POPULATE_BATCH = 1000;
const UPLOAD_CONCURRENCY = 8;

/** Runs `worker` over `items` with bounded concurrency. */
async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
    }));
}

/**
 * Creates a version with the serving config, uploads files Hosting doesn't
 * already have, finalizes it and releases it. Version creation is retried
 * because a newly created site can take minutes to propagate.
 */
export async function deployVersion(
    hosting: HostingClient,
    siteId: string,
    servingConfig: object,
    files: HostingFile[],
    releaseMessage: string,
): Promise<{ versionName: string; uploaded: number }> {
    const version = await withRetry(
        () => hosting.createVersion(siteId, servingConfig, { "deployed-by": "pocket-url" }),
        { attempts: 8, baseDelayMs: 5000, retryOn: [403, 404, 409, 412, 429, 500, 502, 503, 504] },
    );

    const byHash = new Map(files.map((file) => [file.hash, file]));
    const required = new Set<string>();
    let uploadUrl = "";
    for (let i = 0; i < files.length; i += POPULATE_BATCH) {
        const batch = Object.fromEntries(files.slice(i, i + POPULATE_BATCH).map((file) => [file.path, file.hash]));
        const result = await withRetry(() => hosting.populateFiles(version.name, batch));
        result.uploadRequiredHashes?.forEach((hash) => required.add(hash));
        if (result.uploadUrl) uploadUrl = result.uploadUrl;
    }

    if (required.size > 0) {
        if (!uploadUrl) throw new Error("Hosting did not return an upload URL");
        await pool([...required], UPLOAD_CONCURRENCY, async (hash) => {
            const file = byHash.get(hash);
            if (!file) throw new Error(`Hosting requested an unknown file hash ${hash}`);
            await withRetry(() => hosting.uploadFile(uploadUrl, hash, file.gzipped));
        });
    }

    await withRetry(() => hosting.finalizeVersion(version.name));
    await withRetry(() => hosting.createRelease(siteId, version.name, releaseMessage));
    return { versionName: version.name, uploaded: required.size };
}
