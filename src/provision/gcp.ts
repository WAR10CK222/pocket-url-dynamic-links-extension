import { GoogleAuth } from "google-auth-library";

/** A failed Google API call, with the HTTP status for retry decisions. */
export class GcpError extends Error {
    constructor(message: string, public readonly status: number, public readonly body: unknown) {
        super(message);
    }
}

export interface GcpRequest {
    url: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    params?: Record<string, string | number | boolean | undefined>;
    /** JSON body. */
    data?: unknown;
    /** Raw body (file uploads). */
    body?: Uint8Array;
    headers?: Record<string, string>;
}

export type GcpRequester = <T>(request: GcpRequest) => Promise<T>;

let auth: GoogleAuth | null = null;

async function accessToken(): Promise<string> {
    auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const token = await auth.getAccessToken();
    if (!token) throw new GcpError("Could not obtain an access token for the function's service account", 401, null);
    return token;
}

/** Calls a Google REST API as the function's (managed) service account. */
export const gcpRequest: GcpRequester = async <T>(request: GcpRequest): Promise<T> => {
    const url = new URL(request.url);
    for (const [key, value] of Object.entries(request.params ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}`, ...request.headers };
    let body: string | Uint8Array | undefined;
    if (request.body) {
        body = request.body;
    } else if (request.data !== undefined) {
        body = JSON.stringify(request.data);
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
        method: request.method ?? "GET",
        headers,
        body: body as RequestInit["body"],
        signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
        parsed = text ? JSON.parse(text) : {};
    } catch {
        parsed = text;
    }
    if (!response.ok) {
        const message = (parsed as { error?: { message?: string } })?.error?.message ?? `${response.status} ${response.statusText}`;
        throw new GcpError(`${request.method ?? "GET"} ${url.pathname}: ${message}`, response.status, parsed);
    }
    return parsed as T;
};

export const statusOf = (error: unknown): number => (error instanceof GcpError ? error.status : 0);

/** Retries transient failures (and the propagation delay right after creating a site). */
export async function withRetry<T>(
    task: () => Promise<T>,
    options: { attempts?: number; baseDelayMs?: number; retryOn?: number[] } = {},
): Promise<T> {
    const attempts = options.attempts ?? 6;
    const retryOn = options.retryOn ?? [429, 500, 502, 503, 504];
    let delay = options.baseDelayMs ?? 2000;
    for (let attempt = 1; ; attempt++) {
        try {
            return await task();
        } catch (error) {
            if (attempt >= attempts || !retryOn.includes(statusOf(error))) throw error;
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, 60_000);
        }
    }
}
