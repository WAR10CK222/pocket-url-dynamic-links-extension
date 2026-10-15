import { gcpRequest, GcpRequester } from "./gcp";

interface DatabaseInstance {
    name: string;
    type?: "DEFAULT_DATABASE" | "USER_DATABASE" | string;
    databaseUrl?: string;
    state?: string;
}

const BASE = "https://firebasedatabase.googleapis.com/v1beta";

/**
 * Makes sure the project has a default Realtime Database instance, creating one
 * in us-central1 if it doesn't. Requires the Blaze plan.
 */
export async function ensureDefaultDatabase(
    projectId: string,
    request: GcpRequester = gcpRequest,
): Promise<{ created: boolean; url: string }> {
    const list = await request<{ instances?: DatabaseInstance[] }>({
        url: `${BASE}/projects/${projectId}/locations/-/instances`,
    });
    const existing = list.instances?.find((instance) => instance.type === "DEFAULT_DATABASE");
    if (existing?.databaseUrl) return { created: false, url: existing.databaseUrl };

    const created = await request<DatabaseInstance>({
        url: `${BASE}/projects/${projectId}/locations/us-central1/instances`,
        method: "POST",
        params: { databaseId: `${projectId}-default-rtdb` },
        data: { type: "DEFAULT_DATABASE" },
    });
    return { created: true, url: created.databaseUrl ?? `https://${projectId}-default-rtdb.firebaseio.com` };
}
