import { FormEvent, useState } from "react";
import { ApiError } from "../api";
import { errorText, fromLocalInput, isHttpUrl, toLocalInput } from "../format";
import { useApp } from "../hooks";
import { Link, LinkFields } from "../types";
import { Overlay } from "./ui";

interface FormState {
    slug: string;
    redirectUrl: string;
    title: string;
    description: string;
    image: string;
    redirectToStore: boolean;
    forwardQuery: boolean;
    disabled: boolean;
    preview: boolean;
    expireAt: string;
    iosFallbackUrl: string;
    androidFallbackUrl: string;
    desktopUrl: string;
    tags: string;
}

function initialState(link?: Partial<Link>): FormState {
    return {
        slug: link?.slug ?? "",
        redirectUrl: link?.redirectUrl ?? "",
        title: link?.og?.title ?? "",
        description: link?.og?.description ?? "",
        image: link?.og?.image ?? "",
        redirectToStore: link?.redirectToStore ?? false,
        forwardQuery: link?.forwardQuery ?? false,
        disabled: link?.disabled ?? false,
        preview: link?.preview ?? false,
        expireAt: toLocalInput(link?.expireAt),
        iosFallbackUrl: link?.iosFallbackUrl ?? "",
        androidFallbackUrl: link?.androidFallbackUrl ?? "",
        desktopUrl: link?.desktopUrl ?? "",
        tags: (link?.tags ?? []).join(", "),
    };
}

function toFields(state: FormState): LinkFields {
    const og: LinkFields["og"] = {};
    if (state.title.trim()) og.title = state.title.trim();
    if (state.description.trim()) og.description = state.description.trim();
    if (state.image.trim()) og.image = state.image.trim();
    return {
        redirectUrl: state.redirectUrl.trim(),
        og,
        redirectToStore: state.redirectToStore,
        forwardQuery: state.forwardQuery,
        disabled: state.disabled,
        preview: state.preview,
        expireAt: fromLocalInput(state.expireAt),
        iosFallbackUrl: state.iosFallbackUrl.trim() || null,
        androidFallbackUrl: state.androidFallbackUrl.trim() || null,
        desktopUrl: state.desktopUrl.trim() || null,
        tags: state.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
}

/**
 * Create or edit a link. `link` with a slug means edit; `prefill` seeds a new link
 * (e.g. creating a link for a slug that has been getting 404s).
 */
export function LinkForm({ link, prefill, onClose, onSaved }: {
    link?: Link;
    prefill?: Partial<Link>;
    onClose: () => void;
    onSaved: (link: Link) => void;
}) {
    const { api, config, toast } = useApp();
    const editing = Boolean(link);
    const [state, setState] = useState<FormState>(() => initialState(link ?? prefill));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((prev) => ({ ...prev, [key]: value }));

    const urlProblems: Record<string, string> = {};
    for (const key of ["redirectUrl", "image", "iosFallbackUrl", "androidFallbackUrl", "desktopUrl"] as const) {
        if (state[key].trim() && !isHttpUrl(state[key].trim())) urlProblems[key] = "Enter a full http(s):// URL";
    }
    if (state.slug && !/^[A-Za-z0-9_-]{1,64}$/.test(state.slug)) urlProblems.slug = "Use letters, digits, - or _ (max 64)";

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!state.redirectUrl.trim() || Object.keys(urlProblems).length > 0) {
            setFieldErrors({ ...urlProblems, ...(!state.redirectUrl.trim() ? { redirectUrl: "Required" } : {}) });
            return;
        }
        setSaving(true);
        setError(null);
        setFieldErrors({});
        try {
            const fields = toFields(state);
            const saved = editing && link
                ? await api.updateLink(link.slug, fields)
                : await api.createLink({ ...fields, ...(state.slug.trim() ? { slug: state.slug.trim() } : {}) });
            toast(editing ? "Link updated" : "Link created");
            onSaved(saved);
        } catch (err) {
            if (err instanceof ApiError && err.issues.length) {
                setFieldErrors(Object.fromEntries(err.issues.map((issue) => [issue.path.split(".").pop() ?? issue.path, issue.message])));
            }
            setError(errorText(err));
        } finally {
            setSaving(false);
        }
    };

    const fieldError = (key: string) => fieldErrors[key] ?? undefined;
    const domain = (() => {
        try {
            return new URL(state.redirectUrl).host;
        } catch {
            return config.shortDomain;
        }
    })();

    return (
        <Overlay onClose={onClose} label={editing ? "Edit link" : "New link"}>
            <form onSubmit={submit} style={{ display: "contents" }} noValidate>
                <div className="page-head">
                    <h1>{editing ? `Edit /${link?.slug}` : "New link"}</h1>
                    <button type="button" onClick={onClose} aria-label="Close">Close</button>
                </div>

                <label className="field">
                    <span>Destination URL</span>
                    <input type="url" required value={state.redirectUrl} placeholder="https://example.com/page" onChange={(e) => set("redirectUrl", e.target.value)} autoFocus />
                    {fieldError("redirectUrl") && <span className="error">{fieldError("redirectUrl")}</span>}
                </label>

                {!editing && (
                    <label className="field">
                        <span>Custom slug (optional)</span>
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                            <span className="card-sub">{config.shortDomain}/</span>
                            <input value={state.slug} placeholder="auto-generated" onChange={(e) => set("slug", e.target.value)} style={{ flex: 1 }} />
                        </div>
                        {fieldError("slug") && <span className="error">{fieldError("slug")}</span>}
                    </label>
                )}

                <h2>Social preview</h2>
                <label className="field">
                    <span>Title</span>
                    <input value={state.title} maxLength={300} onChange={(e) => set("title", e.target.value)} />
                </label>
                <label className="field">
                    <span>Description</span>
                    <textarea value={state.description} maxLength={1000} onChange={(e) => set("description", e.target.value)} />
                </label>
                <label className="field">
                    <span>Image URL</span>
                    <input type="url" value={state.image} placeholder="https://… (1200×630 works best)" onChange={(e) => set("image", e.target.value)} />
                    {fieldError("image") && <span className="error">{fieldError("image")}</span>}
                </label>
                {(state.title || state.image) && (
                    <div className="preview-card" aria-label="Preview">
                        {state.image && isHttpUrl(state.image) && <img src={state.image} alt="" />}
                        <div className="body">
                            <div className="domain">{domain}</div>
                            <strong>{state.title || config.siteName}</strong>
                            {state.description && <div className="card-sub">{state.description}</div>}
                        </div>
                    </div>
                )}

                <h2>Behavior</h2>
                <label className="check">
                    <input type="checkbox" checked={state.redirectToStore} onChange={(e) => set("redirectToStore", e.target.checked)} />
                    <span>Open in the app<small>On iOS and Android, open your app if installed, otherwise go to the App Store or Play Store.</small></span>
                </label>
                <label className="check">
                    <input type="checkbox" checked={state.forwardQuery} onChange={(e) => set("forwardQuery", e.target.checked)} />
                    <span>Forward query parameters<small>Pass ?utm_… and other parameters on the short link through to the destination.</small></span>
                </label>
                <label className="check">
                    <input type="checkbox" checked={state.preview} onChange={(e) => set("preview", e.target.checked)} />
                    <span>Test link<small>Works normally but clicks aren't counted.</small></span>
                </label>
                <label className="check">
                    <input type="checkbox" checked={state.disabled} onChange={(e) => set("disabled", e.target.checked)} />
                    <span>Disabled<small>The link shows a "not found" page.</small></span>
                </label>
                <label className="field">
                    <span>Expires (optional)</span>
                    <input type="datetime-local" value={state.expireAt} onChange={(e) => set("expireAt", e.target.value)} />
                </label>

                <details>
                    <summary>Platform-specific destinations</summary>
                    <div className="grid" style={{ marginTop: 12 }}>
                        {([
                            ["iosFallbackUrl", "iOS", "Where iPhone/iPad users go (or the App Store fallback when opening the app)."],
                            ["androidFallbackUrl", "Android", "Where Android users go (or the Play Store fallback when opening the app)."],
                            ["desktopUrl", "Desktop", "Where desktop browsers go."],
                        ] as const).map(([key, label, hint]) => (
                            <label className="field" key={key}>
                                <span>{label}</span>
                                <input type="url" value={state[key]} onChange={(e) => set(key, e.target.value)} />
                                <span className="hint">{hint}</span>
                                {fieldError(key) && <span className="error">{fieldError(key)}</span>}
                            </label>
                        ))}
                    </div>
                </details>

                <label className="field">
                    <span>Tags</span>
                    <input value={state.tags} placeholder="campaign, spring" onChange={(e) => set("tags", e.target.value)} />
                </label>

                {error && <div className="notice critical" role="alert">{error}</div>}
                <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="submit" className="primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create link"}</button>
                </div>
            </form>
        </Overlay>
    );
}
