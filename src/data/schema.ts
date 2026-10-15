import { z } from "zod";
import { parseExpiry } from "../common/dates";

/** A link as stored at `<root>/links/{slug}`. Analytics live elsewhere. */
export interface LinkRecord {
    redirectUrl: string;
    og?: { title?: string; description?: string; image?: string };
    redirectToStore?: boolean;
    disabled?: boolean;
    /** Epoch milliseconds after which the link stops resolving. */
    expireAt?: number | null;
    /** Preview/test links resolve normally but are not counted. */
    preview?: boolean;
    iosFallbackUrl?: string | null;
    androidFallbackUrl?: string | null;
    desktopUrl?: string | null;
    /** Forward the short link's query string to the destination. */
    forwardQuery?: boolean;
    tags?: string[];
    createdAt?: number;
    createdBy?: string;
    updatedAt?: number;
}

export interface LinkWithSlug extends LinkRecord {
    slug: string;
}

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const RESERVED_SLUGS = new Set(["_", "__", "api", "admin", "images", "assets", "static", "favicon", "robots", "well-known"]);

export function isReservedSlug(slug: string): boolean {
    return RESERVED_SLUGS.has(slug.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
    return SLUG_PATTERN.test(slug) && !isReservedSlug(slug);
}

export function isHttpUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 2048) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

const httpUrl = z.string().trim().max(2048).refine(isHttpUrl, { message: "Must be an http:// or https:// URL" });
/** Optional URL where "" and null both mean "not set". */
const nullableUrl = z.preprocess((value) => (value === "" ? null : value), httpUrl.nullable().optional());

const linkFields = {
    redirectUrl: httpUrl,
    og: z.object({
        title: z.string().trim().max(300).optional(),
        description: z.string().trim().max(1000).optional(),
        image: z.preprocess((value) => (value === "" ? undefined : value), httpUrl.optional()),
    }).strict().optional(),
    redirectToStore: z.boolean().optional(),
    disabled: z.boolean().optional(),
    expireAt: z.number().int().positive().nullable().optional(),
    preview: z.boolean().optional(),
    iosFallbackUrl: nullableUrl,
    androidFallbackUrl: nullableUrl,
    desktopUrl: nullableUrl,
    forwardQuery: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
};

export const createLinkSchema = z.object({
    ...linkFields,
    slug: z.string().trim().refine(isValidSlug, {
        message: "Slugs use 1-64 letters, digits, '-' or '_', and can't be a reserved word",
    }).optional(),
}).strict();

export const updateLinkSchema = z.object(linkFields).partial().strict();

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

const str = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * Reads a stored link, accepting both the current shape and the 0.0.x legacy shape
 * (`og:title` keys, string expiry dates, nested analytics/log). Returns null when
 * the value isn't a link at all.
 */
export function normalizeLink(raw: unknown): LinkRecord | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    const og = (value.og && typeof value.og === "object" ? value.og : {}) as Record<string, unknown>;

    const link: LinkRecord = {
        redirectUrl: str(value.redirectUrl) ?? "",
    };
    const title = str(og.title) ?? str(value["og:title"]);
    const description = str(og.description) ?? str(value["og:description"]);
    const image = str(og.image) ?? str(value["og:image"]);
    if (title || description || image) {
        link.og = {};
        if (title) link.og.title = title;
        if (description) link.og.description = description;
        if (image) link.og.image = image;
    }
    if (value.redirectToStore === true) link.redirectToStore = true;
    if (value.disabled === true) link.disabled = true;
    if (value.preview === true) link.preview = true;
    if (value.forwardQuery === true) link.forwardQuery = true;
    const expireAt = parseExpiry(value.expireAt);
    if (expireAt !== null) link.expireAt = expireAt;
    for (const key of ["iosFallbackUrl", "androidFallbackUrl", "desktopUrl"] as const) {
        const url = str(value[key]);
        if (url) link[key] = url;
    }
    if (Array.isArray(value.tags)) {
        link.tags = value.tags.filter((tag): tag is string => typeof tag === "string");
    }
    for (const key of ["createdAt", "updatedAt"] as const) {
        if (typeof value[key] === "number") link[key] = value[key] as number;
    }
    const createdBy = str(value.createdBy);
    if (createdBy) link.createdBy = createdBy;
    return link;
}

/** Drops undefined values (RTDB rejects them) and, unless keepNull, nulls too. */
export function compact<T extends Record<string, unknown>>(value: T, keepNull = false): Partial<T> {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (entry === undefined) continue;
        if (entry === null && !keepNull) continue;
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            const nested = compact(entry as Record<string, unknown>, false);
            if (Object.keys(nested).length === 0) {
                if (keepNull) out[key] = null;
                continue;
            }
            out[key] = nested;
            continue;
        }
        out[key] = entry;
    }
    return out as Partial<T>;
}
