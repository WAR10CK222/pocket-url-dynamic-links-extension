const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat();

/** 1,284 / 12.9K / 4.2M */
export function formatCount(value: number): string {
    return Math.abs(value) < 10_000 ? full.format(value) : compact.format(value);
}

export function formatFull(value: number): string {
    return full.format(value);
}

/** "20261015" → Date at UTC midnight. */
export function keyToDate(key: string): Date {
    return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
}

export function dateToKey(date: Date): string {
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

const shortDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatDayKey(key: string): string {
    return shortDay.format(keyToDate(key));
}

export function formatTimestamp(ms?: number | null): string {
    return ms ? dateTime.format(new Date(ms)) : "—";
}

/** `<input type="datetime-local">` value ↔ epoch ms, in the viewer's time zone. */
export function toLocalInput(ms?: number | null): string {
    if (!ms) return "";
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number | null {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
}

export function lastDays(days: number): { from: string; to: string } {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    return { from: dateToKey(from), to: dateToKey(to) };
}

export function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

export function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
