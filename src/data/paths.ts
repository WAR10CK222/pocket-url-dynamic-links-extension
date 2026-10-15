/**
 * Database layout, relative to the instance root (DATABASE_PATH):
 *
 *   links/{slug}                   link config only
 *   analytics/{slug}               aggregated counters per link
 *   clicks/{YYYYMMDD}/{slug}/{id}  raw click events, bucketed by day for cheap retention
 *   stats/daily/{YYYYMMDD}         project-wide daily totals (dashboard overview)
 *   ops/daily/{YYYYMMDD}           404s, errors and latency buckets (dashboard ops)
 *   meta                           schemaVersion, linkCount, provisioning, domain
 */
export const rel = {
    links: "links",
    link: (slug: string) => `links/${slug}`,
    analytics: (slug: string) => `analytics/${slug}`,
    clicksDay: (day: string) => `clicks/${day}`,
    clicks: (day: string, slug: string) => `clicks/${day}/${slug}`,
    statsDaily: "stats/daily",
    statsDay: (day: string) => `stats/daily/${day}`,
    opsDaily: "ops/daily",
    opsDay: (day: string) => `ops/daily/${day}`,
    meta: "meta",
    linkCount: "meta/linkCount",
    schemaVersion: "meta/schemaVersion",
    provisioning: "meta/provisioning",
    domain: "meta/domain",
    migration: "meta/migration",
    prunedThrough: "meta/prunedThrough",
};

export const SCHEMA_VERSION = 2;
