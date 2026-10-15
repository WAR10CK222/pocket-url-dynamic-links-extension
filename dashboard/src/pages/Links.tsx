import { useEffect, useState } from "react";
import { CsvImport } from "../components/CsvImport";
import { LinkForm } from "../components/LinkForm";
import { QrDialog } from "../components/QrDialog";
import { copyText, ErrorNotice, StatusBadge } from "../components/ui";
import { errorText, formatFull, formatTimestamp } from "../format";
import { useApp } from "../hooks";
import { href } from "../route";
import { Link } from "../types";

export function LinksPage() {
    const { api, toast } = useApp();
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("");
    const [links, setLinks] = useState<Link[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [editing, setEditing] = useState<Link | "new" | null>(null);
    const [qr, setQr] = useState<Link | null>(null);
    const [importing, setImporting] = useState(false);
    const [refresh, setRefresh] = useState(0);

    const load = async (next: string | null, append: boolean) => {
        setLoading(true);
        try {
            const page = await api.listLinks({ cursor: next, q: query.trim(), status });
            setLinks((prev) => (append ? [...prev, ...page.links] : page.links));
            setCursor(page.nextCursor);
            setError(null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => void load(null, false), query ? 250 : 0);
        return () => clearTimeout(timer);
        // Reload when filters change or after edits.
    }, [query, status, refresh]);

    const remove = async (link: Link) => {
        if (!window.confirm(`Delete /${link.slug}? Its analytics are deleted too. This can't be undone.`)) return;
        try {
            await api.deleteLink(link.slug);
            setLinks((prev) => prev.filter((item) => item.slug !== link.slug));
            toast("Link deleted");
        } catch (err) {
            toast(errorText(err));
        }
    };

    const copy = async (link: Link) => toast((await copyText(link.shortUrl)) ? "Copied" : "Couldn't copy");

    return (
        <>
            <div className="page-head">
                <h1>Links</h1>
                <div className="row">
                    <button type="button" onClick={() => setImporting(true)}>Import CSV</button>
                    <button type="button" className="primary" onClick={() => setEditing("new")}>New link</button>
                </div>
            </div>
            <div className="row">
                <input type="search" placeholder="Search by slug prefix" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search links" />
                <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="expired">Expired</option>
                </select>
            </div>
            <ErrorNotice error={error} />
            <section className={`card${loading && links.length ? " loading" : ""}`} style={{ padding: 0 }}>
                {links.length === 0 && !loading ? (
                    <div className="empty">
                        {query || status ? "No links match these filters." : "No links yet. Create one, import a CSV, or use createShortLink() from your backend."}
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Short link</th>
                                    <th>Destination</th>
                                    <th>Status</th>
                                    <th className="num">Clicks</th>
                                    <th>Created</th>
                                    <th><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {links.map((link) => (
                                    <tr key={link.slug}>
                                        <td><a href={href({ page: "link", slug: link.slug })}>/{link.slug}</a>{link.og?.title && <div className="card-sub truncate">{link.og.title}</div>}</td>
                                        <td className="truncate" title={link.redirectUrl}>{link.redirectUrl}</td>
                                        <td><StatusBadge status={link.status} /></td>
                                        <td className="num">{formatFull(link.totalClicks ?? 0)}</td>
                                        <td className="card-sub">{formatTimestamp(link.createdAt)}</td>
                                        <td>
                                            <div className="row" style={{ flexWrap: "nowrap", gap: 2 }}>
                                                <button type="button" className="link-button" onClick={() => copy(link)}>Copy</button>
                                                <button type="button" className="link-button" onClick={() => setQr(link)}>QR</button>
                                                <button type="button" className="link-button" onClick={() => setEditing(link)}>Edit</button>
                                                <button type="button" className="link-button danger" onClick={() => remove(link)}>Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            {cursor && (
                <div className="row" style={{ justifyContent: "center" }}>
                    <button type="button" disabled={loading} onClick={() => load(cursor, true)}>{loading ? "Loading…" : "Load more"}</button>
                </div>
            )}
            {editing && (
                <LinkForm
                    link={editing === "new" ? undefined : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        setRefresh((n) => n + 1);
                    }}
                />
            )}
            {qr && <QrDialog slug={qr.slug} shortUrl={qr.shortUrl} onClose={() => setQr(null)} />}
            {importing && <CsvImport onClose={() => setImporting(false)} onDone={() => setRefresh((n) => n + 1)} />}
        </>
    );
}
