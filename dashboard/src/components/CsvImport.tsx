import Papa from "papaparse";
import { useState } from "react";
import { BatchResult } from "../api";
import { errorText, isHttpUrl } from "../format";
import { useApp } from "../hooks";
import { LinkFields } from "../types";
import { Overlay } from "./ui";

type Row = LinkFields & { slug?: string };

interface ParsedRow {
    row: Row;
    problem: string | null;
}

const BATCH = 500;
const pick = (record: Record<string, string>, ...keys: string[]) => {
    for (const key of keys) {
        const value = record[key]?.trim();
        if (value) return value;
    }
    return "";
};

/** Accepts common column names: url/redirectUrl/destination, slug, title, description, image, tags. */
export function toRow(record: Record<string, string>): ParsedRow {
    const normalized = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.trim().toLowerCase(), value ?? ""]));
    const redirectUrl = pick(normalized, "url", "redirecturl", "redirect_url", "destination", "long_url", "link");
    const slug = pick(normalized, "slug", "code", "short", "path");
    const og: LinkFields["og"] = {};
    const title = pick(normalized, "title", "og:title");
    const description = pick(normalized, "description", "og:description");
    const image = pick(normalized, "image", "og:image");
    if (title) og.title = title;
    if (description) og.description = description;
    if (image) og.image = image;
    const tags = pick(normalized, "tags").split(/[;,]/).map((tag) => tag.trim()).filter(Boolean);
    const row: Row = { redirectUrl, og, ...(slug ? { slug } : {}), ...(tags.length ? { tags } : {}) };
    let problem: string | null = null;
    if (!redirectUrl) problem = "Missing URL";
    else if (!isHttpUrl(redirectUrl)) problem = "URL must start with http(s)://";
    else if (slug && !/^[A-Za-z0-9_-]{1,64}$/.test(slug)) problem = "Invalid slug";
    else if (image && !isHttpUrl(image)) problem = "Invalid image URL";
    return { row, problem };
}

export function CsvImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const { api, toast } = useApp();
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [fileName, setFileName] = useState("");
    const [results, setResults] = useState<BatchResult["results"] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const valid = rows.filter((parsed) => !parsed.problem);

    const onFile = (file: File) => {
        setFileName(file.name);
        setResults(null);
        setError(null);
        Papa.parse<Record<string, string>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (parsed) => setRows(parsed.data.map(toRow)),
            error: (err) => setError(err.message),
        });
    };

    const runImport = async () => {
        setBusy(true);
        setError(null);
        const all: BatchResult["results"] = [];
        try {
            for (let i = 0; i < valid.length; i += BATCH) {
                const batch = valid.slice(i, i + BATCH);
                const result = await api.batchCreate(batch.map((parsed) => parsed.row));
                all.push(...result.results.map((r) => ({ ...r, index: r.index + i })));
            }
            setResults(all);
            toast(`Imported ${all.filter((r) => r.ok).length} links`);
            onDone();
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Overlay onClose={onClose} center label="Import links from CSV">
            <div className="page-head">
                <h1>Import links</h1>
                <button type="button" onClick={onClose}>Close</button>
            </div>
            <p className="card-sub" style={{ margin: 0 }}>
                CSV with a header row. Columns: <code>url</code> (required), <code>slug</code>, <code>title</code>, <code>description</code>, <code>image</code>, <code>tags</code>.
                Rows are checked here first; nothing is created until you confirm.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            {rows.length > 0 && !results && (
                <>
                    <div className="notice">
                        {fileName}: <strong>{valid.length}</strong> ready, <strong>{rows.length - valid.length}</strong> with problems (skipped).
                    </div>
                    <div className="table-wrap" style={{ maxHeight: 260 }}>
                        <table>
                            <thead><tr><th>#</th><th>URL</th><th>Slug</th><th>Check</th></tr></thead>
                            <tbody>
                                {rows.slice(0, 200).map((parsed, i) => (
                                    <tr key={i}>
                                        <td>{i + 1}</td>
                                        <td className="truncate">{parsed.row.redirectUrl}</td>
                                        <td>{parsed.row.slug ?? <span className="card-sub">auto</span>}</td>
                                        <td style={{ color: parsed.problem ? "var(--critical-text)" : "var(--good-text)" }}>{parsed.problem ?? "OK"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            {results && (
                <div className="table-wrap" style={{ maxHeight: 300 }}>
                    <table>
                        <thead><tr><th>#</th><th>Result</th></tr></thead>
                        <tbody>
                            {results.map((result) => (
                                <tr key={result.index}>
                                    <td>{result.index + 1}</td>
                                    <td style={{ color: result.ok ? "var(--good-text)" : "var(--critical-text)" }}>{result.ok ? result.shortUrl : result.error}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {error && <div className="notice critical" role="alert">{error}</div>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" onClick={onClose}>{results ? "Done" : "Cancel"}</button>
                {!results && <button type="button" className="primary" disabled={busy || valid.length === 0} onClick={runImport}>
                    {busy ? "Importing…" : `Import ${valid.length} links`}
                </button>}
            </div>
        </Overlay>
    );
}
