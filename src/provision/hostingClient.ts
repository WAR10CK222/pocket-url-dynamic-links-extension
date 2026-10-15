import { gcpRequest, GcpRequester, statusOf } from "./gcp";

const BASE = "https://firebasehosting.googleapis.com/v1beta1";

export interface Site {
    name: string;
    defaultUrl?: string;
    type?: "DEFAULT_SITE" | "USER_SITE" | string;
    labels?: Record<string, string>;
}

export interface Release {
    name: string;
    version?: { name: string; labels?: Record<string, string> };
    message?: string;
    releaseTime?: string;
}

export interface DnsRecord {
    domainName: string;
    type: string;
    rdata: string;
    requiredAction?: string;
}

export interface CustomDomain {
    name: string;
    hostState?: string;
    ownershipState?: string;
    cert?: { state?: string; type?: string };
    reconciling?: boolean;
    requiredDnsUpdates?: {
        desired?: Array<{ domainName: string; records?: DnsRecord[] }>;
        checkTime?: string;
    };
}

/**
 * Version names come back as `projects/<number>/sites/<site>/versions/<id>`, while
 * releases.create documents `sites/<site>/versions/<id>`. Normalize to the latter.
 */
export function normalizeVersionName(name: string | null | undefined): string | null {
    if (!name) return null;
    return name.replace(/^projects\/[^/]+\//, "");
}

/** Thin wrapper over the Firebase Hosting REST API (v1beta1). */
export class HostingClient {
    constructor(private readonly projectId: string, private readonly request: GcpRequester = gcpRequest) {}

    private site(siteId: string): string {
        return `${BASE}/projects/${this.projectId}/sites/${siteId}`;
    }

    /** Returns null when the site doesn't exist in this project (404, or 403 if owned elsewhere). */
    async getSite(siteId: string): Promise<Site | null> {
        try {
            return await this.request<Site>({ url: this.site(siteId) });
        } catch (error) {
            if ([403, 404].includes(statusOf(error))) return null;
            throw error;
        }
    }

    createSite(siteId: string, labels: Record<string, string>, validateOnly = false): Promise<Site> {
        return this.request<Site>({
            url: `${BASE}/projects/${this.projectId}/sites`,
            method: "POST",
            params: { siteId, validateOnly: validateOnly || undefined },
            data: { labels },
        });
    }

    updateSiteLabels(siteId: string, labels: Record<string, string>): Promise<Site> {
        return this.request<Site>({ url: this.site(siteId), method: "PATCH", params: { updateMask: "labels" }, data: { labels } });
    }

    updateSiteConfig(siteId: string, maxVersions: number): Promise<unknown> {
        return this.request({
            url: `${this.site(siteId)}/config`,
            method: "PATCH",
            params: { updateMask: "maxVersions" },
            data: { maxVersions: String(maxVersions) },
        });
    }

    async latestRelease(siteId: string): Promise<Release | null> {
        const result = await this.request<{ releases?: Release[] }>({ url: `${this.site(siteId)}/releases`, params: { pageSize: 1 } });
        return result.releases?.[0] ?? null;
    }

    createVersion(siteId: string, config: object, labels: Record<string, string>): Promise<{ name: string }> {
        return this.request<{ name: string }>({ url: `${this.site(siteId)}/versions`, method: "POST", data: { config, labels } });
    }

    populateFiles(versionName: string, files: Record<string, string>): Promise<{ uploadRequiredHashes?: string[]; uploadUrl?: string }> {
        return this.request({ url: `${BASE}/${versionName}:populateFiles`, method: "POST", data: { files } });
    }

    uploadFile(uploadUrl: string, hash: string, gzipped: Uint8Array): Promise<unknown> {
        return this.request({
            url: `${uploadUrl}/${hash}`,
            method: "POST",
            body: gzipped,
            headers: { "Content-Type": "application/octet-stream" },
        });
    }

    finalizeVersion(versionName: string): Promise<unknown> {
        return this.request({ url: `${BASE}/${versionName}`, method: "PATCH", params: { updateMask: "status" }, data: { status: "FINALIZED" } });
    }

    createRelease(siteId: string, versionName: string, message: string): Promise<Release> {
        return this.request<Release>({
            url: `${this.site(siteId)}/releases`,
            method: "POST",
            params: { versionName: normalizeVersionName(versionName) ?? versionName },
            data: { message: message.slice(0, 512) },
        });
    }

    async getCustomDomain(siteId: string, domain: string): Promise<CustomDomain | null> {
        try {
            return await this.request<CustomDomain>({ url: `${this.site(siteId)}/customDomains/${domain}` });
        } catch (error) {
            if (statusOf(error) === 404) return null;
            throw error;
        }
    }

    createCustomDomain(siteId: string, domain: string): Promise<{ name: string; done?: boolean }> {
        return this.request({ url: `${this.site(siteId)}/customDomains`, method: "POST", params: { customDomainId: domain }, data: {} });
    }
}

/** Flattens a custom domain into what the dashboard shows: states plus DNS records to add. */
export function summarizeCustomDomain(domain: string, resource: CustomDomain | null) {
    const records = (resource?.requiredDnsUpdates?.desired ?? []).flatMap((entry) =>
        (entry.records ?? []).map((record) => ({
            domainName: record.domainName || entry.domainName,
            type: record.type,
            rdata: record.rdata,
            requiredAction: record.requiredAction ?? "NONE",
        })));
    const certState = resource?.cert?.state ?? "CERT_STATE_UNSPECIFIED";
    return {
        domain,
        found: Boolean(resource),
        hostState: resource?.hostState ?? "HOST_STATE_UNSPECIFIED",
        ownershipState: resource?.ownershipState ?? "OWNERSHIP_STATE_UNSPECIFIED",
        certState,
        reconciling: resource?.reconciling ?? false,
        active: resource?.hostState === "HOST_ACTIVE" && resource?.ownershipState === "OWNERSHIP_ACTIVE" &&
            ["CERT_ACTIVE", "CERT_EXPIRING_SOON"].includes(certState),
        records,
        checkTime: resource?.requiredDnsUpdates?.checkTime ?? null,
    };
}
