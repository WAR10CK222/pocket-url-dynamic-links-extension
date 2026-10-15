import { gcpRequest, GcpRequester } from "./gcp";

/**
 * Adds domains to Firebase Auth's authorized domains so Google sign-in works on
 * the dashboard. Read-modify-write: the update replaces the whole list, so
 * existing domains are always sent back.
 */
export async function ensureAuthorizedDomains(
    projectId: string,
    domains: string[],
    request: GcpRequester = gcpRequest,
): Promise<{ added: string[] }> {
    const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
    const config = await request<{ authorizedDomains?: string[] }>({ url });
    const current = config.authorizedDomains ?? [];
    const missing = [...new Set(domains.filter(Boolean))].filter((domain) => !current.includes(domain));
    if (missing.length === 0) return { added: [] };
    await request({
        url,
        method: "PATCH",
        params: { updateMask: "authorizedDomains" },
        data: { authorizedDomains: [...current, ...missing] },
    });
    return { added: missing };
}
