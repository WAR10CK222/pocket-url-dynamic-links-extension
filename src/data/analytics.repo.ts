import { createHash } from "crypto";
import { Database, Reference, ServerValue } from "firebase-admin/database";
import { encodeKey } from "../common/utils/dbKeys";
import { addDays, dateKey, dateKeysBetween } from "../common/dates";
import { rel } from "./paths";
import { SLUG_PATTERN } from "./schema";

export interface UtmParams {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
}

/** One click, as stored under clicks/{day}/{slug}/{id}. IP addresses are never stored. */
export interface ClickEvent {
    timestamp: number;
    referrer: string;
    platform: string;
    deviceType: string;
    os: string;
    browser: string;
    country: string;
    city: string;
    region: string;
    utmParams: UtmParams;
    /** "web" for browser visits, "app" when the click was resolved by the mobile app. */
    source: "web" | "app";
}

export const LATENCY_BUCKETS = [
    { key: "lt50", max: 50 },
    { key: "lt100", max: 100 },
    { key: "lt250", max: 250 },
    { key: "lt500", max: 500 },
    { key: "lt1000", max: 1000 },
    { key: "gte1000", max: Infinity },
] as const;

export function latencyBucket(ms: number): string {
    return LATENCY_BUCKETS.find((bucket) => ms < bucket.max)?.key ?? "gte1000";
}

/** Database-safe, reversible key: bounded length, never empty. */
export function safeKey(value: string): string {
    const trimmed = (value || "").trim().slice(0, 200);
    return trimmed ? encodeKey(trimmed) : "Unknown";
}

export function utmHash(utm: UtmParams): string {
    return createHash("md5").update(JSON.stringify([utm.utm_source, utm.utm_medium, utm.utm_campaign])).digest("hex");
}

/**
 * Builds the single multi-path update that records a human click: per-link
 * counters, the raw event, project-wide daily stats and the latency bucket.
 * `inc` is passed in so tests can inspect paths without a database.
 */
export function buildClickUpdates(
    slug: string,
    event: ClickEvent,
    clickId: string,
    latencyMs: number,
    inc: unknown,
    serverTimestamp: unknown,
): Record<string, unknown> {
    const day = dateKey(event.timestamp);
    const a = rel.analytics(slug);
    const updates: Record<string, unknown> = {};

    updates[`${a}/totalClicks`] = inc;
    updates[`${a}/clickByDate/${day}`] = inc;
    const breakdowns: Array<[string, string]> = [
        ["referrers", event.referrer],
        ["devices", event.deviceType],
        ["os", event.os],
        ["browsers", event.browser],
    ];
    for (const [group, value] of breakdowns) {
        const key = safeKey(value);
        updates[`${a}/${group}/${key}/value`] = value || "Unknown";
        updates[`${a}/${group}/${key}/clickCount`] = inc;
    }
    updates[`${a}/geolocations/country/${safeKey(event.country)}`] = inc;
    updates[`${a}/geolocations/city/${safeKey(event.city)}`] = inc;
    updates[`${a}/geolocations/region/${safeKey(event.region)}`] = inc;
    const { utm_source, utm_medium, utm_campaign } = event.utmParams;
    if (utm_source || utm_medium || utm_campaign) {
        const hash = utmHash(event.utmParams);
        updates[`${a}/utmData/${hash}/clickCount`] = inc;
        updates[`${a}/utmData/${hash}/utmParams`] = event.utmParams;
    }
    updates[`${a}/updateTimestamp`] = serverTimestamp;

    updates[`${rel.clicks(day, slug)}/${clickId}`] = event;

    const s = rel.statsDay(day);
    updates[`${s}/clicks`] = inc;
    updates[`${s}/links/${slug}`] = inc;
    updates[`${s}/countries/${safeKey(event.country)}`] = inc;
    updates[`${s}/referrers/${safeKey(event.referrer)}`] = inc;
    updates[`${s}/devices/${safeKey(event.deviceType)}`] = inc;
    if (event.source === "app") updates[`${s}/appResolves`] = inc;

    updates[`${rel.opsDay(day)}/latency/${latencyBucket(latencyMs)}`] = inc;
    return updates;
}

type Counters = Record<string, number>;

export interface DailyStats {
    clicks?: number;
    bots?: number;
    appResolves?: number;
    links?: Counters;
    countries?: Counters;
    referrers?: Counters;
    devices?: Counters;
}

export interface DailyOps {
    errors?: number;
    notFound?: Counters;
    notFoundOther?: number;
    latency?: Counters;
}

/** Records clicks and reads aggregated analytics. */
export class AnalyticsRepo {
    private readonly root: Reference;

    constructor(db: Database, rootPath: string) {
        this.root = db.ref(rootPath);
    }

    async recordClick(slug: string, event: ClickEvent, latencyMs: number): Promise<void> {
        const clickId = this.root.push().key as string;
        const updates = buildClickUpdates(slug, event, clickId, latencyMs, ServerValue.increment(1), ServerValue.TIMESTAMP);
        await this.root.update(updates);
    }

    async recordBot(slug: string, now = Date.now()): Promise<void> {
        await this.root.update({
            [`${rel.analytics(slug)}/botClicks`]: ServerValue.increment(1),
            [`${rel.statsDay(dateKey(now))}/bots`]: ServerValue.increment(1),
        });
    }

    /**
     * Counts a miss. Only plausible slugs from real browsers get their own key, so
     * vulnerability scanners probing random paths can't bloat the database.
     */
    async recordNotFound(slug: string, isBot: boolean, now = Date.now()): Promise<void> {
        const day = rel.opsDay(dateKey(now));
        const path = !isBot && SLUG_PATTERN.test(slug) ? `${day}/notFound/${slug}` : `${day}/notFoundOther`;
        await this.root.update({ [path]: ServerValue.increment(1) });
    }

    async recordError(now = Date.now()): Promise<void> {
        await this.root.update({ [`${rel.opsDay(dateKey(now))}/errors`]: ServerValue.increment(1) });
    }

    async getLinkAnalytics(slug: string): Promise<Record<string, unknown>> {
        const snapshot = await this.root.child(rel.analytics(slug)).get();
        return (snapshot.val() as Record<string, unknown>) ?? {};
    }

    async getLinkTotals(slug: string): Promise<{ totalClicks: number; botClicks: number }> {
        const [total, bots] = await Promise.all([
            this.root.child(`${rel.analytics(slug)}/totalClicks`).get(),
            this.root.child(`${rel.analytics(slug)}/botClicks`).get(),
        ]);
        return {
            totalClicks: typeof total.val() === "number" ? total.val() : 0,
            botClicks: typeof bots.val() === "number" ? bots.val() : 0,
        };
    }

    /** Most recent raw clicks for a link over the last `days` days, newest first. */
    async getRecentClicks(slug: string, days: number, limit: number): Promise<Array<ClickEvent & { id: string }>> {
        const today = dateKey();
        const keys = dateKeysBetween(addDays(today, -(days - 1)), today).reverse();
        const results: Array<ClickEvent & { id: string }> = [];
        for (const day of keys) {
            if (results.length >= limit) break;
            const snapshot = await this.root.child(rel.clicks(day, slug)).orderByKey()
                .limitToLast(limit - results.length).get();
            const dayClicks: Array<ClickEvent & { id: string }> = [];
            snapshot.forEach((child) => {
                dayClicks.push({ id: child.key as string, ...(child.val() as ClickEvent) });
            });
            results.push(...dayClicks.reverse());
        }
        return results.slice(0, limit);
    }

    async getDailyStats(from: string, to: string): Promise<Record<string, DailyStats>> {
        const snapshot = await this.root.child(rel.statsDaily).orderByKey().startAt(from).endAt(to).get();
        return (snapshot.val() as Record<string, DailyStats>) ?? {};
    }

    async getDailyOps(from: string, to: string): Promise<Record<string, DailyOps>> {
        const snapshot = await this.root.child(rel.opsDaily).orderByKey().startAt(from).endAt(to).get();
        return (snapshot.val() as Record<string, DailyOps>) ?? {};
    }
}
