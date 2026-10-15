import { gcpRequest, GcpRequester } from "./gcp";

interface CloudFunction {
    name: string;
    state?: string;
    serviceConfig?: { service?: string; uri?: string };
}

export interface DeployedFunction {
    id: string;
    region: string;
    serviceId: string;
    uri: string;
}

export interface KitFunctions {
    prefix: string;
    region: string;
    redirect: DeployedFunction | null;
    api: DeployedFunction | null;
    provision: DeployedFunction | null;
}

/** Regions where Firebase Hosting can rewrite to Cloud Run (2nd gen functions). */
export const HOSTING_REWRITE_REGIONS = new Set([
    "asia-east1", "asia-east2", "asia-northeast1", "asia-northeast2", "asia-northeast3", "asia-south1", "asia-south2",
    "asia-southeast1", "asia-southeast2", "asia-southeast3", "australia-southeast1", "australia-southeast2",
    "europe-central2", "europe-north1", "europe-southwest1", "europe-west1", "europe-west2", "europe-west3",
    "europe-west4", "europe-west6", "europe-west8", "europe-west9", "europe-west12", "me-central1", "me-central2",
    "me-west1", "northamerica-northeast1", "northamerica-northeast2", "southamerica-east1", "southamerica-west1",
    "us-central1", "us-east1", "us-east4", "us-east5", "us-south1", "us-west1", "us-west2", "us-west3", "us-west4",
]);

export async function listFunctions(projectId: string, request: GcpRequester = gcpRequest): Promise<CloudFunction[]> {
    const all: CloudFunction[] = [];
    let pageToken: string | undefined;
    do {
        const page = await request<{ functions?: CloudFunction[]; nextPageToken?: string }>({
            url: `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions`,
            params: { pageSize: 500, pageToken },
        });
        all.push(...(page.functions ?? []));
        pageToken = page.nextPageToken;
    } while (pageToken);
    return all;
}

export function toDeployed(fn: CloudFunction): DeployedFunction {
    const parts = fn.name.split("/");
    const id = parts[parts.length - 1];
    const region = parts[parts.indexOf("locations") + 1] ?? "";
    // Service IDs are assigned by Cloud Functions; read them rather than guessing.
    const service = fn.serviceConfig?.service?.split("/").pop();
    return {
        id,
        region,
        serviceId: service || id.toLowerCase().replace(/_/g, "-"),
        uri: fn.serviceConfig?.uri ?? "",
    };
}

/**
 * Finds this kit instance's functions. The prefix (`kit-<instance>-` when installed
 * as a kit, or a codebase prefix) is derived from the provision function's own
 * Cloud Run service (`K_SERVICE`), falling back to FIREBASE_KIT_INSTANCE_ID.
 */
export function resolveKitFunctions(
    functions: CloudFunction[],
    ownServiceId: string | undefined,
    instanceId: string | undefined,
): KitFunctions {
    const deployed = functions.filter((fn) => fn.state !== "FAILED").map(toDeployed);
    const self = ownServiceId ? deployed.find((fn) => fn.serviceId === ownServiceId && fn.id.endsWith("provision")) : undefined;
    const prefix = self ? self.id.slice(0, -"provision".length) : instanceId ? `kit-${instanceId}-` : "";
    const preferredRegion = self?.region;

    const find = (name: string): DeployedFunction | null => {
        const matches = deployed.filter((fn) => fn.id === `${prefix}${name}`);
        return matches.find((fn) => fn.region === preferredRegion) ?? matches[0] ?? null;
    };
    const redirect = find("redirect");
    return {
        prefix,
        region: preferredRegion ?? redirect?.region ?? "",
        redirect,
        api: find("api"),
        provision: self ?? find("provision"),
    };
}
