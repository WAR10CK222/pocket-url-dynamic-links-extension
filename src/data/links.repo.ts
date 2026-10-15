import { Database, Reference, ServerValue } from "firebase-admin/database";
import { rel } from "./paths";
import {
    compact,
    CreateLinkInput,
    LinkRecord,
    LinkWithSlug,
    normalizeLink,
    UpdateLinkInput,
} from "./schema";
import { generateSlug } from "./slug";

export class SlugTakenError extends Error {
    constructor(public readonly slug: string) {
        super(`The slug "${slug}" is already in use.`);
    }
}

export class LinkNotFoundError extends Error {
    constructor(public readonly slug: string) {
        super(`No link with slug "${slug}".`);
    }
}

export interface ListLinksOptions {
    cursor?: string;
    limit?: number;
    /** Only slugs starting with this prefix. */
    prefix?: string;
}

/** CRUD for link configs. Shared by the API, the redirect handler and the `./admin` helper. */
export class LinksRepo {
    private readonly root: Reference;

    constructor(db: Database, rootPath: string) {
        this.root = db.ref(rootPath);
    }

    async get(slug: string): Promise<LinkRecord | null> {
        const snapshot = await this.root.child(rel.link(slug)).get();
        return snapshot.exists() ? normalizeLink(snapshot.val()) : null;
    }

    /**
     * Creates a link with the given or a generated slug. Uses a transaction so an
     * existing link is never overwritten; generated slugs retry on collision.
     */
    async create(input: CreateLinkInput, createdBy: string, slugLength = 7): Promise<LinkWithSlug> {
        const { slug: requested, ...fields } = input;
        const now = Date.now();
        const record = compact({ ...fields, createdAt: now, updatedAt: now, createdBy }) as LinkRecord;

        const attempts = requested ? 1 : 5;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const slug = requested ?? generateSlug(slugLength + Math.floor(attempt / 2));
            const result = await this.root.child(rel.link(slug)).transaction(
                (current) => (current === null ? record : undefined),
                undefined,
                false,
            );
            if (result.committed) {
                await this.root.child(rel.linkCount).set(ServerValue.increment(1));
                return { slug, ...record };
            }
            if (requested) throw new SlugTakenError(slug);
        }
        throw new Error("Could not generate a unique slug; try again.");
    }

    async update(slug: string, patch: UpdateLinkInput): Promise<LinkWithSlug> {
        const ref = this.root.child(rel.link(slug));
        const snapshot = await ref.get();
        if (!snapshot.exists()) throw new LinkNotFoundError(slug);
        const changes = compact({ ...patch, updatedAt: Date.now() } as Record<string, unknown>, true);
        await ref.update(changes);
        const updated = normalizeLink((await ref.get()).val());
        return { slug, ...(updated as LinkRecord) };
    }

    /** Deletes the link and its aggregated analytics. Raw clicks expire with retention. */
    async delete(slug: string): Promise<void> {
        const snapshot = await this.root.child(rel.link(slug)).get();
        if (!snapshot.exists()) throw new LinkNotFoundError(slug);
        await this.root.update({
            [rel.link(slug)]: null,
            [rel.analytics(slug)]: null,
            [rel.linkCount]: ServerValue.increment(-1),
        });
    }

    /** Pages through links in slug order. */
    async list(options: ListLinksOptions = {}): Promise<{ links: LinkWithSlug[]; nextCursor: string | null }> {
        const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
        let query = this.root.child(rel.links).orderByKey();
        if (options.prefix) {
            query = query.startAt(options.cursor && options.cursor > options.prefix ? options.cursor : options.prefix)
                .endAt(`${options.prefix}`);
        } else if (options.cursor) {
            query = query.startAt(options.cursor);
        }
        // Fetch one extra to know whether another page exists; startAt is inclusive.
        const snapshot = await query.limitToFirst(limit + 2).get();
        const links: LinkWithSlug[] = [];
        snapshot.forEach((child) => {
            if (child.key === options.cursor) return;
            const link = normalizeLink(child.val());
            if (link && child.key) links.push({ slug: child.key, ...link });
        });
        const page = links.slice(0, limit);
        const nextCursor = links.length > limit ? page[page.length - 1].slug : null;
        return { links: page, nextCursor };
    }

    async count(): Promise<number> {
        const snapshot = await this.root.child(rel.linkCount).get();
        return typeof snapshot.val() === "number" ? Math.max(0, snapshot.val()) : 0;
    }
}
