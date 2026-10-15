import { useState } from "react";
import { ChartCard, ColumnChart, LineChart } from "../components/charts";
import { LinkForm } from "../components/LinkForm";
import { DateRangePicker, ErrorNotice, RankList, Severity, StatTile, StatusLabel } from "../components/ui";
import { errorText, formatDayKey, formatTimestamp, lastDays } from "../format";
import { useApp, useLoad } from "../hooks";
import { href } from "../route";
import { Provisioning } from "../types";

const LATENCY_LABELS: Record<string, string> = {
    lt50: "< 50 ms",
    lt100: "50–100",
    lt250: "100–250",
    lt500: "250–500",
    lt1000: "500–1000",
    gte1000: "≥ 1 s",
};

function provisioningSeverity(state?: Provisioning["state"]): Severity {
    if (state === "ready") return "good";
    if (state === "failed") return "critical";
    return "pending";
}

export function ProvisioningCard({ provisioning, onRerun, rerunning }: { provisioning: Provisioning; onRerun: () => void; rerunning: boolean }) {
    const severity = provisioningSeverity(provisioning.state);
    const label = provisioning.state === "ready" ? "Ready" : provisioning.state === "failed" ? "Failed" : provisioning.state === "running" ? `Running: ${provisioning.step}` : "Not run yet";
    return (
        <section className="card">
            <div className="card-head">
                <div>
                    <h2>Provisioning</h2>
                    <div className="card-sub">Hosting site, dashboard, association files, Auth domains and custom domain. Runs after every deploy.</div>
                </div>
                <button type="button" onClick={onRerun} disabled={rerunning || provisioning.state === "running"}>
                    {rerunning ? "Queued…" : "Re-run"}
                </button>
            </div>
            <div className="grid" style={{ gap: 8 }}>
                <StatusLabel severity={severity}>{label}</StatusLabel>
                <div className="card-sub">
                    {provisioning.finishedAt ? `Last finished ${formatTimestamp(provisioning.finishedAt)}` : ""}
                    {provisioning.version ? ` · kit ${provisioning.version}` : ""}
                    {provisioning.reason ? ` · trigger: ${provisioning.reason}` : ""}
                    {provisioning.skippedDeploy ? " · Hosting already up to date" : ""}
                </div>
                {provisioning.error && <div className="notice critical">{provisioning.error}</div>}
                {(provisioning.warnings ?? []).map((warning, i) => (
                    <div key={i} className="notice warning"><StatusLabel severity="warning">Warning</StatusLabel> {warning}</div>
                ))}
            </div>
        </section>
    );
}

export function OpsPage() {
    const { api, toast } = useApp();
    const [range, setRange] = useState(lastDays(7));
    const [rerunning, setRerunning] = useState(false);
    const [creating, setCreating] = useState<string | null>(null);
    const { data, error, loading, reload } = useLoad(() => api.ops(range), [api, range.from, range.to]);

    const rerun = async () => {
        setRerunning(true);
        try {
            await api.rerunProvisioning();
            toast("Provisioning queued");
            setTimeout(() => void reload(), 4000);
        } catch (err) {
            toast(errorText(err));
        } finally {
            setTimeout(() => setRerunning(false), 4000);
        }
    };

    const notFoundTotal = data ? data.series.reduce((sum, day) => sum + day.notFound, 0) : null;
    const errorTotal = data ? data.series.reduce((sum, day) => sum + day.errors, 0) : null;
    const bucketKeys = Object.keys(LATENCY_LABELS);

    return (
        <>
            <div className="page-head">
                <h1>Operations</h1>
                <DateRangePicker value={range} onChange={setRange} />
            </div>
            <ErrorNotice error={error} />
            <div className={`grid kpis${loading && data ? " loading" : ""}`}>
                <StatTile label="404s" value={notFoundTotal} note="Unknown, disabled or expired links" />
                <StatTile label="Server errors" value={errorTotal} note={errorTotal ? "See Cloud Logging below" : "None in range"} />
                <StatTile label="Redirect time, median" value={null} display={data?.latency.p50 ? `≤ ${data.latency.p50} ms` : "—"} note="Lookup to response, server-side" />
                <StatTile label="Redirect time, p95" value={null} display={data?.latency.p95 ? `≤ ${data.latency.p95} ms` : "—"} />
            </div>
            {data && (
                <>
                    <ProvisioningCard provisioning={data.provisioning} onRerun={rerun} rerunning={rerunning} />
                    <div className="grid two">
                        <ChartCard
                            title="404s and errors per day"
                            loading={loading}
                            table={{ columns: ["Day", "404s", "Errors"], rows: data.series.map((d) => [formatDayKey(d.date), d.notFound, d.errors]) }}
                        >
                            <LineChart
                                label="404s and errors per day"
                                dates={data.series.map((d) => d.date)}
                                series={[
                                    { label: "404s", values: data.series.map((d) => d.notFound), color: "series1" },
                                    { label: "Errors", values: data.series.map((d) => d.errors), color: "series2" },
                                ]}
                            />
                        </ChartCard>
                        <ChartCard
                            title="Redirect latency"
                            subtitle="Counted clicks by server time bucket"
                            loading={loading}
                            table={{ columns: ["Bucket", "Clicks"], rows: bucketKeys.map((key) => [LATENCY_LABELS[key], data.latency.buckets[key] ?? 0]) }}
                        >
                            <ColumnChart
                                label="Redirect latency histogram"
                                labels={bucketKeys.map((key) => LATENCY_LABELS[key])}
                                values={bucketKeys.map((key) => data.latency.buckets[key] ?? 0)}
                                valueLabel="clicks"
                            />
                        </ChartCard>
                    </div>
                    <div className="grid two">
                        <RankList
                            title="Most-requested missing links"
                            subtitle={data.notFoundOther ? `Plus ${data.notFoundOther} hits from bots or invalid paths` : "Broken or mistyped links people are visiting"}
                            items={data.topNotFound}
                            empty="No 404s in range"
                            render={(item) => {
                                const exists = data.topNotFound.find((entry) => entry.key === item.key)?.exists;
                                return exists ? <a href={href({ page: "link", slug: item.key })}>/{item.label} (now exists)</a> : (
                                    <span>/{item.label} <button type="button" className="link-button" onClick={() => setCreating(item.key)}>Create link</button></span>
                                );
                            }}
                        />
                        <section className="card">
                            <div className="card-head"><h2>Logs and metrics</h2></div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                                {data.consoleLinks.logs && <li><a href={data.consoleLinks.logs} target="_blank" rel="noreferrer">Warnings and errors in Cloud Logging</a></li>}
                                {data.consoleLinks.redirectMetrics && <li><a href={data.consoleLinks.redirectMetrics} target="_blank" rel="noreferrer">Redirect function metrics (requests, latency, instances)</a></li>}
                                {data.consoleLinks.functions && <li><a href={data.consoleLinks.functions} target="_blank" rel="noreferrer">Functions in the Firebase console</a></li>}
                                {data.consoleLinks.hosting && <li><a href={data.consoleLinks.hosting} target="_blank" rel="noreferrer">Hosting site and release history</a></li>}
                                {data.consoleLinks.database && <li><a href={data.consoleLinks.database} target="_blank" rel="noreferrer">Realtime Database</a></li>}
                            </ul>
                        </section>
                    </div>
                </>
            )}
            {creating && (
                <LinkForm prefill={{ slug: creating }} onClose={() => setCreating(null)} onSaved={() => {
                    setCreating(null);
                    void reload();
                }} />
            )}
        </>
    );
}
