import { Database, ServerValue } from "firebase-admin/database";
import { dateKey, isDateKey, parseExpiry } from "../common/dates";
import { ClickEvent } from "./analytics.repo";
import { rel, SCHEMA_VERSION } from "./paths";

const LOG_BATCH = 2000;

type Logger = (message: string, data?: Record<string, unknown>) => void;

/** Flattens a nested object into `{ "a/b/c": leaf }` entries. */
function flatten(value: unknown, prefix: string, out: Record<string, unknown>): void {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            flatten(child, prefix ? `${prefix}/${key}` : key, out);
        }
    } else if (value !== undefined && value !== null) {
        out[prefix] = value;
    }
}

function referrerHost(referrer: unknown): string {
    if (typeof referrer !== "string" || referrer === "" || referrer === "direct") return "direct";
    try {
        return new URL(referrer).hostname || referrer;
    } catch {
        return referrer;
    }
}

function legacyEventToClick(raw: Record<string, unknown>): { day: string; event: ClickEvent } {
    const timestamp = typeof raw.timestamp === "number" ? raw.timestamp : Date.now();
    const day = isDateKey(raw.date) ? raw.date : dateKey(timestamp);
    const utm = (raw.utmParams ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" && value ? value : "Unknown");
    return {
        day,
        event: {
            timestamp,
            referrer: referrerHost(raw.referrer),
            platform: "unknown",
            deviceType: text(raw.deviceType),
            os: text(raw.os),
            browser: text(raw.browser),
            country: text(raw.country),
            city: text(raw.city),
            region: text(raw.region),
            utmParams: {
                utm_source: typeof utm.utm_source === "string" ? utm.utm_source : "",
                utm_medium: typeof utm.utm_medium === "string" ? utm.utm_medium : "",
                utm_campaign: typeof utm.utm_campaign === "string" ? utm.utm_campaign : "",
            },
            source: "web",
        },
    };
}

/**
 * Moves data from the 0.0.x layout (analytics and an unbounded click log nested
 * inside each link) to the current layout. Every write is one atomic multi-path
 * update that adds the legacy data to the new location AND deletes it from the
 * old one, so the migration is safe to re-run or resume after a failure.
 * Legacy counters are added with increments, so clicks recorded by the new code
 * before the migration ran are preserved.
 */
export async function migrateLegacyLayout(
    db: Database,
    rootPath: string,
    options: { retentionDays: number; chunkSize?: number; log?: Logger },
): Promise<{ migratedLinks: number; skipped: boolean; linkCount: number }> {
    const root = db.ref(rootPath);
    const log: Logger = options.log ?? (() => undefined);
    const version = (await root.child(rel.schemaVersion).get()).val();
    if (typeof version === "number" && version >= SCHEMA_VERSION) {
        return { migratedLinks: 0, skipped: true, linkCount: -1 };
    }

    const chunkSize = options.chunkSize ?? 200;
    const retentionCutoff = dateKey(Date.now() - options.retentionDays * 24 * 60 * 60 * 1000);
    let cursor: string | null = (await root.child(`${rel.migration}/lastKey`).get()).val();
    let migratedLinks = 0;

    for (;;) {
        let query = root.child(rel.links).orderByKey();
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.limitToFirst(chunkSize).get();
        if (!snapshot.exists()) break;

        const entries: Array<[string, Record<string, unknown>]> = [];
        snapshot.forEach((child) => {
            entries.push([child.key as string, (child.val() ?? {}) as Record<string, unknown>]);
        });

        for (const [slug, value] of entries) {
            if (await migrateLink(root, slug, value, retentionCutoff)) migratedLinks++;
        }
        cursor = entries[entries.length - 1][0];
        await root.child(`${rel.migration}/lastKey`).set(cursor);
        log("Migrated a chunk of links", { through: cursor, migratedLinks });
        if (entries.length < chunkSize) break;
    }

    // Recount links now that every node is config-only.
    let linkCount = 0;
    let countCursor: string | null = null;
    for (;;) {
        let query = root.child(rel.links).orderByKey();
        if (countCursor) query = query.startAfter(countCursor);
        const snapshot = await query.limitToFirst(1000).get();
        if (!snapshot.exists()) break;
        snapshot.forEach((child) => {
            linkCount++;
            countCursor = child.key;
        });
        if (snapshot.numChildren() < 1000) break;
    }

    await root.update({
        [rel.schemaVersion]: SCHEMA_VERSION,
        [rel.linkCount]: linkCount,
        [rel.migration]: { completedAt: ServerValue.TIMESTAMP, migratedLinks },
    });
    return { migratedLinks, skipped: false, linkCount };
}

async function migrateLink(
    root: ReturnType<Database["ref"]>,
    slug: string,
    value: Record<string, unknown>,
    retentionCutoff: string,
): Promise<boolean> {
    const linkPath = rel.link(slug);
    const legacyLog = value.log && typeof value.log === "object" ? (value.log as Record<string, unknown>) : null;
    const legacyAnalytics = value.analytics && typeof value.analytics === "object" ? value.analytics : null;
    const hasLegacyFields = ["og:title", "og:description", "og:image"].some((key) => key in value) ||
        typeof value.expireAt === "string";
    if (!legacyLog && !legacyAnalytics && !hasLegacyFields) return false;

    // 1. Move the click log in batches; each batch deletes what it copied.
    if (legacyLog) {
        const ids = Object.keys(legacyLog);
        for (let i = 0; i < ids.length; i += LOG_BATCH) {
            const updates: Record<string, unknown> = {};
            for (const id of ids.slice(i, i + LOG_BATCH)) {
                const raw = legacyLog[id];
                updates[`${linkPath}/log/${id}`] = null;
                if (!raw || typeof raw !== "object") continue;
                const { day, event } = legacyEventToClick(raw as Record<string, unknown>);
                if (day < retentionCutoff) continue; // Older than retention: drop instead of copying.
                updates[`${rel.clicks(day, slug)}/${id}`] = event;
            }
            await root.update(updates);
        }
    }

    // 2. Add legacy counters to the new analytics node and normalize fields, atomically.
    const updates: Record<string, unknown> = {};
    if (legacyAnalytics) {
        const leaves: Record<string, unknown> = {};
        flatten(legacyAnalytics, "", leaves);
        for (const [path, leaf] of Object.entries(leaves)) {
            const target = `${rel.analytics(slug)}/${path}`;
            const isCounter = typeof leaf === "number" && !path.endsWith("updateTimestamp");
            updates[target] = isCounter ? ServerValue.increment(leaf as number) : leaf;
        }
        updates[`${linkPath}/analytics`] = null;
    }
    const og: Record<string, string> = {};
    for (const key of ["title", "description", "image"]) {
        const legacy = value[`og:${key}`];
        if (typeof legacy === "string" && legacy.trim()) og[key] = legacy.trim();
        if (`og:${key}` in value) updates[`${linkPath}/og:${key}`] = null;
    }
    if (Object.keys(og).length > 0) updates[`${linkPath}/og`] = { ...((value.og as object) ?? {}), ...og };
    if (typeof value.expireAt === "string") updates[`${linkPath}/expireAt`] = parseExpiry(value.expireAt);
    if (Object.keys(updates).length > 0) await root.update(updates);
    return true;
}
