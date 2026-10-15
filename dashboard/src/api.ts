import { Auth } from "firebase/auth";
import { Click, Link, LinkFields, LinkStats, Ops, Overview, Range } from "./types";

export class ApiError extends Error {
    constructor(message: string, public readonly status: number, public readonly code?: string, public readonly data?: unknown) {
        super(message);
    }

    /** Field-level validation messages from the API, if any. */
    get issues(): Array<{ path: string; message: string }> {
        const issues = (this.data as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues;
        return Array.isArray(issues) ? issues : [];
    }
}

export interface BatchResult {
    results: Array<{ index: number; ok: boolean; slug?: string; shortUrl?: string; error?: string }>;
    created: number;
}

export function createApi(auth: Auth, base: string) {
    async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`${base}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...init.headers,
            },
        });
        const body = await res.json().catch(() => null) as { success?: boolean; message?: string; data?: unknown } | null;
        if (!res.ok || !body?.success) {
            const data = body?.data as { code?: string } | undefined;
            throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status, data?.code, body?.data);
        }
        return body.data as T;
    }

    const range = (r?: Range) => (r ? `from=${r.from}&to=${r.to}` : "");
    const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

    return {
        me: () => request<{ uid: string; email: string | null; admin: boolean }>("/me"),
        listLinks: (params: { cursor?: string | null; q?: string; status?: string; limit?: number }) => {
            const query = new URLSearchParams();
            if (params.cursor) query.set("cursor", params.cursor);
            if (params.q) query.set("q", params.q);
            if (params.status) query.set("status", params.status);
            query.set("limit", String(params.limit ?? 50));
            return request<{ links: Link[]; nextCursor: string | null }>(`/links?${query}`);
        },
        getLink: (slug: string) => request<Link>(`/links/${encodeURIComponent(slug)}`),
        createLink: (fields: LinkFields & { slug?: string }) => request<Link>("/links", json("POST", fields)),
        updateLink: (slug: string, fields: Partial<LinkFields>) => request<Link>(`/links/${encodeURIComponent(slug)}`, json("PATCH", fields)),
        deleteLink: (slug: string) => request<{ deleted: boolean }>(`/links/${encodeURIComponent(slug)}`, { method: "DELETE" }),
        batchCreate: (links: Array<LinkFields & { slug?: string }>) => request<BatchResult>("/links/batch", json("POST", { links })),
        linkStats: (slug: string, r: Range) => request<LinkStats>(`/links/${encodeURIComponent(slug)}/stats?${range(r)}`),
        linkClicks: (slug: string, days = 7) => request<{ clicks: Click[] }>(`/links/${encodeURIComponent(slug)}/clicks?days=${days}&limit=100`),
        overview: (r: Range) => request<Overview>(`/stats/overview?${range(r)}`),
        ops: (r: Range) => request<Ops>(`/ops?${range(r)}`),
        rerunProvisioning: () => request<{ queued: boolean }>("/ops/provision", { method: "POST" }),
    };
}

export type Api = ReturnType<typeof createApi>;
