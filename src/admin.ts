/**
 * Helpers for your own backend code (Cloud Functions, servers, scripts) to manage
 * Pocket URL links with the Admin SDK, without going through the HTTP API.
 *
 *   import { createShortLink } from "@war10ck222/pocket-url/admin";
 *   const link = await createShortLink(
 *       { redirectUrl: "https://acme.com/article/42", og: { title: "Article 42" } },
 *       { shortDomain: "go.acme.com" },
 *   );
 *
 * This entry point never declares function params, so importing it doesn't add
 * prompts to your deploy.
 */
import { Database } from "firebase-admin/database";
import { getDb } from "./common/clients/firebase";
import { LinkNotFoundError, LinksRepo, SlugTakenError } from "./data/links.repo";
import {
    createLinkSchema,
    CreateLinkInput,
    LinkRecord,
    LinkWithSlug,
    updateLinkSchema,
    UpdateLinkInput,
} from "./data/schema";

export { LinkNotFoundError, SlugTakenError };
export type { CreateLinkInput, LinkRecord, LinkWithSlug, UpdateLinkInput };

export interface PocketUrlOptions {
    /** An existing Database instance. Defaults to the default app's database. */
    database?: Database;
    /** Database URL, if not the project's default instance (the kit's RTDB_URL). */
    databaseUrl?: string;
    /** The kit's DATABASE_PATH. Defaults to "dynamicLinksV1". */
    path?: string;
    /** The kit's short domain (custom domain or <site>.web.app), used to build shortUrl. */
    shortDomain?: string;
}

function repo(options: PocketUrlOptions): LinksRepo {
    return new LinksRepo(options.database ?? getDb(options.databaseUrl), options.path ?? "dynamicLinksV1");
}

function withShortUrl<T extends { slug: string }>(link: T, options: PocketUrlOptions): T & { shortUrl: string | null } {
    return { ...link, shortUrl: options.shortDomain ? `https://${options.shortDomain}/${encodeURIComponent(link.slug)}` : null };
}

/** Creates a link. Throws SlugTakenError if a requested slug exists. */
export async function createShortLink(
    input: CreateLinkInput,
    options: PocketUrlOptions & { createdBy?: string } = {},
): Promise<LinkWithSlug & { shortUrl: string | null }> {
    const link = await repo(options).create(createLinkSchema.parse(input), options.createdBy ?? "admin-sdk");
    return withShortUrl(link, options);
}

export async function getShortLink(slug: string, options: PocketUrlOptions = {}): Promise<LinkWithSlug | null> {
    const link = await repo(options).get(slug);
    return link ? { slug, ...link } : null;
}

/** Updates a link. Throws LinkNotFoundError if it doesn't exist. */
export async function updateShortLink(
    slug: string,
    patch: UpdateLinkInput,
    options: PocketUrlOptions = {},
): Promise<LinkWithSlug & { shortUrl: string | null }> {
    return withShortUrl(await repo(options).update(slug, updateLinkSchema.parse(patch)), options);
}

export async function deleteShortLink(slug: string, options: PocketUrlOptions = {}): Promise<void> {
    await repo(options).delete(slug);
}
