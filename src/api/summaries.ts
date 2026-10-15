import { dateKeysBetween } from "../common/dates";
import { decodeKey } from "../common/utils/dbKeys";
import { DailyOps, DailyStats, LATENCY_BUCKETS } from "../data/analytics.repo";

export interface Ranked {
    key: string;
    label: string;
    count: number;
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** `{key: {value, clickCount}}` → ranked list (referrers, devices, os, browsers). */
export function rankBreakdown(map: unknown, limit = 50): Ranked[] {
    if (!map || typeof map !== "object") return [];
    return Object.entries(map as Record<string, { value?: unknown; clickCount?: unknown }>)
        .map(([key, entry]) => ({
            key,
            label: typeof entry?.value === "string" ? entry.value : key,
            count: num(entry?.clickCount),
        }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/** `{key: count}` → ranked list (countries, cities, top links). */
export function rankCounters(map: unknown, limit = 50): Ranked[] {
    if (!map || typeof map !== "object") return [];
    return Object.entries(map as Record<string, unknown>)
        .map(([key, count]) => ({ key, label: decodeKey(key), count: num(count) }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/** Adds several `{key: count}` maps together. */
export function sumCounters(maps: Array<Record<string, number> | undefined>): Record<string, number> {
    const total: Record<string, number> = {};
    for (const map of maps) {
        if (!map) continue;
        for (const [key, count] of Object.entries(map)) total[key] = (total[key] ?? 0) + num(count);
    }
    return total;
}

export interface UtmSummary {
    source: string;
    medium: string;
    campaign: string;
    count: number;
}

/** Merges UTM entries by their parameter values (hashes changed between versions). */
export function summarizeUtm(map: unknown, limit = 50): UtmSummary[] {
    if (!map || typeof map !== "object") return [];
    const merged = new Map<string, UtmSummary>();
    for (const entry of Object.values(map as Record<string, { utmParams?: Record<string, string>; clickCount?: unknown }>)) {
        const params = entry?.utmParams ?? {};
        const item = {
            source: params.utm_source ?? "",
            medium: params.utm_medium ?? "",
            campaign: params.utm_campaign ?? "",
        };
        const key = JSON.stringify(item);
        const existing = merged.get(key);
        if (existing) existing.count += num(entry?.clickCount);
        else merged.set(key, { ...item, count: num(entry?.clickCount) });
    }
    return [...merged.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function clickSeries(from: string, to: string, clickByDate: unknown): Array<{ date: string; clicks: number }> {
    const byDate = (clickByDate && typeof clickByDate === "object" ? clickByDate : {}) as Record<string, unknown>;
    return dateKeysBetween(from, to).map((date) => ({ date, clicks: num(byDate[date]) }));
}

export function overviewFromDaily(from: string, to: string, daily: Record<string, DailyStats>) {
    const days = dateKeysBetween(from, to);
    const series = days.map((date) => ({
        date,
        clicks: num(daily[date]?.clicks),
        bots: num(daily[date]?.bots),
    }));
    const values = days.map((date) => daily[date]).filter(Boolean) as DailyStats[];
    return {
        totals: {
            clicks: series.reduce((sum, day) => sum + day.clicks, 0),
            bots: series.reduce((sum, day) => sum + day.bots, 0),
            appResolves: values.reduce((sum, day) => sum + num(day.appResolves), 0),
        },
        series,
        topLinks: rankCounters(sumCounters(values.map((day) => day.links)), 20),
        countries: rankCounters(sumCounters(values.map((day) => day.countries)), 20),
        referrers: rankCounters(sumCounters(values.map((day) => day.referrers)), 20),
        devices: rankCounters(sumCounters(values.map((day) => day.devices)), 10),
    };
}

/** Approximate latency percentile (upper bound of the bucket containing it). */
export function latencyPercentile(buckets: Record<string, number>, percentile: number): number | null {
    const total = LATENCY_BUCKETS.reduce((sum, bucket) => sum + num(buckets[bucket.key]), 0);
    if (total === 0) return null;
    let seen = 0;
    for (const bucket of LATENCY_BUCKETS) {
        seen += num(buckets[bucket.key]);
        if (seen / total >= percentile) return Number.isFinite(bucket.max) ? bucket.max : 1000;
    }
    return 1000;
}

export function opsFromDaily(from: string, to: string, daily: Record<string, DailyOps>) {
    const days = dateKeysBetween(from, to);
    const values = days.map((date) => daily[date]).filter(Boolean) as DailyOps[];
    const latency = sumCounters(values.map((day) => day.latency));
    return {
        series: days.map((date) => ({
            date,
            errors: num(daily[date]?.errors),
            notFound: Object.values(daily[date]?.notFound ?? {}).reduce((sum, count) => sum + num(count), 0) +
                num(daily[date]?.notFoundOther),
        })),
        topNotFound: rankCounters(sumCounters(values.map((day) => day.notFound)), 20),
        notFoundOther: values.reduce((sum, day) => sum + num(day.notFoundOther), 0),
        latency: {
            buckets: Object.fromEntries(LATENCY_BUCKETS.map((bucket) => [bucket.key, num(latency[bucket.key])])),
            p50: latencyPercentile(latency, 0.5),
            p95: latencyPercentile(latency, 0.95),
        },
    };
}
