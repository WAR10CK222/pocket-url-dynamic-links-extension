import { useState } from "react";
import { ChartCard, LineChart } from "../components/charts";
import { DateRangePicker, ErrorNotice, RankList, StatTile } from "../components/ui";
import { formatDayKey, lastDays } from "../format";
import { useApp, useLoad } from "../hooks";
import { href } from "../route";

export function OverviewPage() {
    const { api } = useApp();
    const [range, setRange] = useState(lastDays(30));
    const { data, error, loading } = useLoad(() => api.overview(range), [api, range.from, range.to]);
    const total = data ? data.totals.clicks + data.totals.bots : 0;

    return (
        <>
            <div className="page-head">
                <h1>Overview</h1>
                <DateRangePicker value={range} onChange={setRange} />
            </div>
            <ErrorNotice error={error} />
            <div className={`grid kpis${loading && data ? " loading" : ""}`}>
                <StatTile label="Clicks" value={data?.totals.clicks ?? null} note="Human visits in range" />
                <StatTile label="Bot and preview hits" value={data?.totals.bots ?? null}
                    note={total ? `${Math.round(((data?.totals.bots ?? 0) / total) * 100)}% of all hits` : "Crawlers and link unfurlers"} />
                <StatTile label="App opens" value={data?.totals.appResolves ?? null} note="Links resolved inside your app" />
                <StatTile label="Links" value={data?.linkCount ?? null} note="Total links" />
            </div>
            {data && (
                <>
                    <ChartCard
                        title="Clicks per day"
                        subtitle="Human clicks, with bot and preview hits for context"
                        loading={loading}
                        table={{ columns: ["Day", "Clicks", "Bot hits"], rows: data.series.map((d) => [formatDayKey(d.date), d.clicks, d.bots]) }}
                    >
                        <LineChart
                            label="Clicks per day"
                            dates={data.series.map((d) => d.date)}
                            series={[
                                { label: "Clicks", values: data.series.map((d) => d.clicks), color: "series1" },
                                { label: "Bot hits", values: data.series.map((d) => d.bots), color: "deemphasis" },
                            ]}
                        />
                    </ChartCard>
                    <div className={`grid two${loading ? " loading" : ""}`}>
                        <RankList title="Top links" items={data.topLinks} render={(item) => <a href={href({ page: "link", slug: item.key })}>/{item.label}</a>} />
                        <RankList title="Countries" items={data.countries} />
                        <RankList title="Referrers" items={data.referrers} subtitle="Referring site; direct = no referrer" />
                        <RankList title="Devices" items={data.devices} />
                    </div>
                </>
            )}
        </>
    );
}
