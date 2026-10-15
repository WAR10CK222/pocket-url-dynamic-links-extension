import { ReactNode, useEffect, useState } from "react";
import { formatCount, formatFull, lastDays } from "../format";
import { LinkStatus, Range, Ranked } from "../types";

export function StatTile({ label, value, note, display, text }: { label: string; value: number | null; note?: string; display?: string; text?: boolean }) {
    return (
        <div className="card stat">
            <div className="label">{label}</div>
            <div className={`value${text ? " text" : ""}`} title={value === null ? undefined : formatFull(value)}>
                {display ?? (value === null ? "—" : formatCount(value))}
            </div>
            {note && <div className="note">{note}</div>}
        </div>
    );
}

/** Ranked top-N as an HTML list: label + value in text ink, a thin bar carries magnitude. */
export function RankList({ title, items, empty = "No data yet", subtitle, render }: {
    title: string;
    items: Ranked[];
    empty?: string;
    subtitle?: string;
    render?: (item: Ranked) => ReactNode;
}) {
    const max = Math.max(1, ...items.map((item) => item.count));
    return (
        <section className="card">
            <div className="card-head">
                <div>
                    <h2>{title}</h2>
                    {subtitle && <div className="card-sub">{subtitle}</div>}
                </div>
            </div>
            {items.length === 0 ? <div className="empty">{empty}</div> : (
                <ol className="rank">
                    {items.slice(0, 10).map((item) => (
                        <li key={item.key}>
                            <span className="name" title={item.label}>{render ? render(item) : item.label}</span>
                            <span className="count">{formatFull(item.count)}</span>
                            <span className="bar" style={{ width: `${(item.count / max) * 100}%` }} aria-hidden="true" />
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

const PRESETS = [7, 30, 90];

/** Date range presets plus a custom range; scopes everything on the page below it. */
export function DateRangePicker({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
    const active = PRESETS.find((days) => {
        const preset = lastDays(days);
        return preset.from === value.from && preset.to === value.to;
    });
    const [custom, setCustom] = useState(!active);
    const toInput = (key: string) => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
    const fromInput = (input: string) => input.replace(/-/g, "");
    return (
        <div className="row">
            <div className="segmented" role="group" aria-label="Date range">
                {PRESETS.map((days) => (
                    <button key={days} type="button" aria-pressed={!custom && active === days} onClick={() => {
                        setCustom(false);
                        onChange(lastDays(days));
                    }}>
                        Last {days} days
                    </button>
                ))}
                <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
            </div>
            {custom && (
                <>
                    <input type="date" aria-label="From" value={toInput(value.from)} max={toInput(value.to)}
                        onChange={(e) => e.target.value && onChange({ ...value, from: fromInput(e.target.value) })} />
                    <span className="card-sub">to</span>
                    <input type="date" aria-label="To" value={toInput(value.to)} min={toInput(value.from)}
                        onChange={(e) => e.target.value && onChange({ ...value, to: fromInput(e.target.value) })} />
                </>
            )}
        </div>
    );
}

const STATUS_DOT: Record<LinkStatus, string> = { active: "var(--good)", disabled: "var(--deemphasis)", expired: "var(--warning)" };

export function StatusBadge({ status }: { status: LinkStatus }) {
    return (
        <span className="badge">
            <span className="dot" style={{ background: STATUS_DOT[status] }} aria-hidden="true" />
            {status[0].toUpperCase() + status.slice(1)}
        </span>
    );
}

export type Severity = "good" | "warning" | "critical" | "pending";

/** Status always pairs an icon and a label with its color. */
export function StatusLabel({ severity, children }: { severity: Severity; children: ReactNode }) {
    const color = { good: "var(--good-text)", warning: "var(--text-primary)", critical: "var(--critical-text)", pending: "var(--text-secondary)" }[severity];
    return (
        <span className="status" style={{ color }}>
            <StatusIcon severity={severity} />
            {children}
        </span>
    );
}

function StatusIcon({ severity }: { severity: Severity }) {
    const common = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true } as const;
    if (severity === "good") {
        return <svg {...common}><circle cx="8" cy="8" r="8" fill="var(--good)" /><path d="M4.5 8.2 7 10.5l4.5-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    }
    if (severity === "critical") {
        return <svg {...common}><circle cx="8" cy="8" r="8" fill="var(--critical)" /><path d="m5.5 5.5 5 5m0-5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    }
    if (severity === "warning") {
        return <svg {...common}><path d="M8 1 15.5 14.5H.5Z" fill="var(--warning)" /><path d="M8 6v4" stroke="#0b0b0b" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="12.2" r="0.9" fill="#0b0b0b" /></svg>;
    }
    return <svg {...common}><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--axis)" strokeWidth="3" /><path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite" /></path></svg>;
}

export function Overlay({ onClose, center, children, label }: { onClose: () => void; center?: boolean; children: ReactNode; label: string }) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div className={`overlay${center ? " center" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className={center ? "dialog" : "drawer"} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
        </div>
    );
}

export function useToast(): [string | null, (message: string) => void] {
    const [message, setMessage] = useState<string | null>(null);
    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(() => setMessage(null), 2200);
        return () => clearTimeout(timer);
    }, [message]);
    return [message, setMessage];
}

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export function ErrorNotice({ error }: { error: unknown }) {
    if (!error) return null;
    return <div className="notice critical" role="alert">{error instanceof Error ? error.message : String(error)}</div>;
}
