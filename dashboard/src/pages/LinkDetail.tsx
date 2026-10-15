import { useState } from "react";
import { ChartCard, LineChart } from "../components/charts";
import { LinkForm } from "../components/LinkForm";
import { QrDialog } from "../components/QrDialog";
import { copyText, DateRangePicker, ErrorNotice, RankList, StatTile, StatusBadge } from "../components/ui";
import { formatDayKey, formatFull, formatTimestamp, lastDays } from "../format";
import { useApp, useLoad } from "../hooks";
import { href } from "../route";

export function LinkDetailPage({ slug }: { slug: string }) {
    const { api, toast } = useApp();
    const [range, setRange] = useState(lastDays(30));
    const [editing, setEditing] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const link = useLoad(() => api.getLink(slug), [api, slug]);
    const stats = useLoad(() => api.linkStats(slug, range), [api, slug, range.from, range.to]);
    const clicks = useLoad(() => api.linkClicks(slug, 7), [api, slug]);
    const s = stats.data;
    const inRange = s ? s.series.reduce((sum, day) => sum + day.clicks, 0) : null;

    return (
        <>
            <div className="card-sub"><a href={href({ page: "links" })}>← Links</a></div>
            <ErrorNotice error={link.error} />
            {link.data && (
                <div className="page-head">
                    <div>
                        <div className="row">
                            <h1>/{link.data.slug}</h1>
                            <StatusBadge status={link.data.status} />
                        </div>
                        <div className="card-sub truncate" style={{ maxWidth: 640 }}>
                            → <a href={link.data.redirectUrl} target="_blank" rel="noreferrer noopener">{link.data.redirectUrl}</a>
                        </div>
                    </div>
                    <div className="row">
                        <button type="button" onClick={async () => toast((await copyText(link.data!.shortUrl)) ? "Copied" : "Couldn't copy")}>Copy short link</button>
                        <button type="button" onClick={() => setShowQr(true)}>QR code</button>
                        <button type="button" className="primary" onClick={() => setEditing(true)}>Edit</button>
                    </div>
                </div>
            )}
            <div className="row">
                <DateRangePicker value={range} onChange={setRange} />
            </div>
            <ErrorNotice error={stats.error} />
            <div className={`grid kpis${stats.loading && s ? " loading" : ""}`}>
                <StatTile label="Clicks in range" value={inRange} />
                <StatTile label="All-time clicks" value={s?.totals.totalClicks ?? null} />
                <StatTile label="Bot and preview hits" value={s?.totals.botClicks ?? null} note="All time" />
                <StatTile label="Last click" value={null} text display={s?.updatedAt ? formatTimestamp(s.updatedAt) : "—"} />
            </div>
            {s && (
                <>
                    <ChartCard
                        title="Clicks per day"
                        loading={stats.loading}
                        table={{ columns: ["Day", "Clicks"], rows: s.series.map((d) => [formatDayKey(d.date), d.clicks]) }}
                    >
                        <LineChart label={`Clicks per day for /${slug}`} dates={s.series.map((d) => d.date)}
                            series={[{ label: "Clicks", values: s.series.map((d) => d.clicks), color: "series1", fill: true }]} />
                    </ChartCard>
                    <p className="card-sub" style={{ margin: 0 }}>Breakdowns below cover all time.</p>
                    <div className="grid three">
                        <RankList title="Referrers" items={s.referrers} />
                        <RankList title="Countries" items={s.countries} />
                        <RankList title="Cities" items={s.cities} />
                        <RankList title="Devices" items={s.devices} />
                        <RankList title="Operating systems" items={s.os} />
                        <RankList title="Browsers" items={s.browsers} />
                    </div>
                    <section className="card">
                        <div className="card-head"><h2>UTM campaigns</h2></div>
                        {s.utm.length === 0 ? <div className="empty">No clicks with UTM parameters yet.</div> : (
                            <div className="table-wrap">
                                <table>
                                    <thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th className="num">Clicks</th></tr></thead>
                                    <tbody>
                                        {s.utm.map((row, i) => (
                                            <tr key={i}><td>{row.source || "—"}</td><td>{row.medium || "—"}</td><td>{row.campaign || "—"}</td><td className="num">{formatFull(row.count)}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
            <section className={`card${clicks.loading && clicks.data ? " loading" : ""}`}>
                <div className="card-head">
                    <h2>Recent clicks</h2>
                    <span className="card-sub">Last 7 days, newest first</span>
                </div>
                <ErrorNotice error={clicks.error} />
                {clicks.data && clicks.data.clicks.length === 0 && <div className="empty">No clicks in the last 7 days.</div>}
                {clicks.data && clicks.data.clicks.length > 0 && (
                    <div className="table-wrap" style={{ maxHeight: 420 }}>
                        <table>
                            <thead><tr><th>Time</th><th>Source</th><th>Referrer</th><th>Location</th><th>Device</th><th>Campaign</th></tr></thead>
                            <tbody>
                                {clicks.data.clicks.map((click) => (
                                    <tr key={click.id}>
                                        <td className="card-sub">{formatTimestamp(click.timestamp)}</td>
                                        <td>{click.source === "app" ? "App" : "Web"}</td>
                                        <td>{click.referrer}</td>
                                        <td>{[click.city, click.country].filter((part) => part && part !== "Unknown").join(", ") || "Unknown"}</td>
                                        <td>{click.os} · {click.browser}</td>
                                        <td>{click.utmParams?.utm_campaign || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            {editing && link.data && (
                <LinkForm link={link.data} onClose={() => setEditing(false)} onSaved={(saved) => {
                    setEditing(false);
                    link.setData(saved);
                }} />
            )}
            {showQr && link.data && <QrDialog slug={slug} shortUrl={link.data.shortUrl} onClose={() => setShowQr(false)} />}
        </>
    );
}
