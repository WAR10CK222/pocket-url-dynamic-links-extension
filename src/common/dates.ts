const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC day key in the `YYYYMMDD` format used throughout the database. */
export function dateKey(date: Date | number = Date.now()): string {
    const d = typeof date === "number" ? new Date(date) : date;
    const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    const dd = d.getUTCDate().toString().padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

export function isDateKey(value: unknown): value is string {
    return typeof value === "string" && /^\d{8}$/.test(value);
}

/** Midnight UTC of a `YYYYMMDD` key, in epoch milliseconds. */
export function dateKeyToMillis(key: string): number {
    return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
}

export function addDays(key: string, days: number): string {
    return dateKey(dateKeyToMillis(key) + days * DAY_MS);
}

/** Inclusive list of day keys between `from` and `to` (capped at `maxDays`). */
export function dateKeysBetween(from: string, to: string, maxDays = 731): string[] {
    const keys: string[] = [];
    let current = from;
    while (current <= to && keys.length < maxDays) {
        keys.push(current);
        current = addDays(current, 1);
    }
    return keys;
}

/**
 * Resolves `from`/`to` query values (YYYYMMDD) into a valid range, defaulting to
 * the last `defaultDays` days and never spanning more than `maxDays`.
 */
export function resolveRange(from: unknown, to: unknown, defaultDays = 30, maxDays = 366): { from: string; to: string } {
    const end = isDateKey(to) ? to : dateKey();
    let start = isDateKey(from) ? from : addDays(end, -(defaultDays - 1));
    if (start > end) start = end;
    const earliest = addDays(end, -(maxDays - 1));
    if (start < earliest) start = earliest;
    return { from: start, to: end };
}

/**
 * Parses a legacy or current expiry value: epoch millis, an ISO date string, or
 * anything `Date.parse` understands. Returns null when there is no valid expiry.
 */
export function parseExpiry(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}
