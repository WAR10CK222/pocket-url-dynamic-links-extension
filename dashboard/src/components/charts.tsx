import {
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    ChartOptions,
    Filler,
    LinearScale,
    LineElement,
    Plugin,
    PointElement,
    Tooltip,
} from "chart.js";
import { ReactNode, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { formatCount, formatDayKey, formatFull } from "../format";
import { ChartTheme, useChartTheme } from "../theme";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip);

type SeriesColor = "series1" | "series2" | "deemphasis";

export interface LineSeries {
    label: string;
    values: number[];
    color: SeriesColor;
    /** Soft area wash under the line (single-series emphasis only). */
    fill?: boolean;
}

function withAlpha(hex: string, alpha: number): string {
    const value = hex.replace("#", "");
    if (value.length !== 6) return hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Vertical hairline at the hovered X, so readers aim at a date rather than a 2px line. */
const crosshair: Plugin<"line"> = {
    id: "pocketUrlCrosshair",
    afterDatasetsDraw(chart) {
        const active = chart.tooltip?.getActiveElements();
        if (!active?.length) return;
        const { ctx, chartArea } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.strokeStyle = (chart.options.plugins as { crosshairColor?: string } | undefined)?.crosshairColor ?? "#c3c2b7";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
    },
};

function baseScales(theme: ChartTheme) {
    return {
        x: {
            grid: { display: false },
            border: { color: theme.axis },
            ticks: { color: theme.muted, autoSkip: true, maxTicksLimit: 8, maxRotation: 0 },
        },
        y: {
            beginAtZero: true,
            grid: { color: theme.grid },
            border: { display: false },
            ticks: { color: theme.muted, precision: 0, callback: (value: string | number) => formatCount(Number(value)) },
        },
    };
}

function tooltipStyle(theme: ChartTheme) {
    return {
        backgroundColor: theme.surface,
        titleColor: theme.muted,
        bodyColor: theme.text,
        borderColor: theme.grid,
        borderWidth: 1,
        padding: 10,
        boxWidth: 12,
        boxHeight: 2,
        usePointStyle: false,
    };
}

export function Legend({ items }: { items: Array<{ label: string; color: SeriesColor }> }) {
    const theme = useChartTheme();
    if (items.length < 2) return null;
    return (
        <div className="legend" aria-hidden="true">
            {items.map((item) => (
                <span key={item.label}>
                    <span className="key" style={{ background: theme[item.color] }} />
                    {item.label}
                </span>
            ))}
        </div>
    );
}

export function LineChart({ dates, series, label }: { dates: string[]; series: LineSeries[]; label: string }) {
    const theme = useChartTheme();
    const data = {
        labels: dates.map(formatDayKey),
        datasets: series.map((s) => ({
            label: s.label,
            data: s.values,
            borderColor: theme[s.color],
            backgroundColor: s.fill ? withAlpha(theme[s.color], 0.1) : theme[s.color],
            fill: s.fill ? "origin" : false,
            borderWidth: 2,
            borderCapStyle: "round" as const,
            borderJoinStyle: "round" as const,
            // Monotone interpolation never overshoots below zero or past a peak.
            cubicInterpolationMode: "monotone" as const,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderWidth: 2,
            pointHoverBorderColor: theme.surface,
            pointHoverBackgroundColor: theme[s.color],
        })),
    };
    const options: ChartOptions<"line"> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                ...tooltipStyle(theme),
                callbacks: { label: (item) => ` ${formatFull(Number(item.raw))}  ${item.dataset.label}` },
            },
            ...({ crosshairColor: theme.axis } as object),
        },
        scales: baseScales(theme),
    };
    return (
        <>
            <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
            <div className="chart-box" role="img" aria-label={label}>
                <Line data={data} options={options} plugins={[crosshair]} />
            </div>
        </>
    );
}

export function ColumnChart({ labels, values, label, valueLabel }: { labels: string[]; values: number[]; label: string; valueLabel: string }) {
    const theme = useChartTheme();
    const options: ChartOptions<"bar"> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: { ...tooltipStyle(theme), callbacks: { label: (item) => ` ${formatFull(Number(item.raw))} ${valueLabel}` } },
        },
        scales: baseScales(theme),
    };
    return (
        <div className="chart-box" role="img" aria-label={label}>
            <Bar
                data={{
                    labels,
                    datasets: [{
                        label: valueLabel,
                        data: values,
                        backgroundColor: theme.series1,
                        hoverBackgroundColor: withAlpha(theme.series1, 0.8),
                        maxBarThickness: 24,
                        borderRadius: 4,
                        borderSkipped: "start",
                    }],
                }}
                options={options}
            />
        </div>
    );
}

/** A card holding a chart and its table-view twin (every value reachable without hovering). */
export function ChartCard({ title, subtitle, table, children, loading }: {
    title: string;
    subtitle?: string;
    table: { columns: string[]; rows: Array<Array<string | number>> };
    children: ReactNode;
    loading?: boolean;
}) {
    const [view, setView] = useState<"chart" | "table">("chart");
    return (
        <section className={`card${loading ? " loading" : ""}`}>
            <div className="card-head">
                <div>
                    <h2>{title}</h2>
                    {subtitle && <div className="card-sub">{subtitle}</div>}
                </div>
                <div className="segmented" role="group" aria-label={`${title} view`}>
                    <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
                    <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
                </div>
            </div>
            {view === "chart" ? children : (
                <div className="table-wrap" style={{ maxHeight: 300 }}>
                    <table>
                        <thead>
                            <tr>{table.columns.map((column, i) => <th key={column} className={i > 0 ? "num" : ""}>{column}</th>)}</tr>
                        </thead>
                        <tbody>
                            {table.rows.map((row, r) => (
                                <tr key={r}>{row.map((cell, i) => <td key={i} className={i > 0 ? "num" : ""}>{typeof cell === "number" ? formatFull(cell) : cell}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
