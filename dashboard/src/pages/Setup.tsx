import { copyText, ErrorNotice, Severity, StatusLabel } from "../components/ui";
import { lastDays } from "../format";
import { useApp, useLoad } from "../hooks";
import { DomainStatus } from "../types";

function domainSeverity(domain: DomainStatus): Severity {
    if (domain.active) return "good";
    if (domain.certState === "CERT_FAILED" || domain.hostState === "HOST_CONFLICT") return "critical";
    return "pending";
}

function Snippet({ code }: { code: string }) {
    const { toast } = useApp();
    return (
        <div style={{ position: "relative" }}>
            <pre className="card" style={{ margin: 0, overflowX: "auto", background: "var(--surface-2)" }}><code>{code}</code></pre>
            <button type="button" style={{ position: "absolute", top: 8, right: 8 }}
                onClick={async () => toast((await copyText(code)) ? "Copied" : "Couldn't copy")}>Copy</button>
        </div>
    );
}

export function SetupPage() {
    const { api, config } = useApp();
    const { data, error } = useLoad(() => api.ops(lastDays(1)), [api]);
    const short = data?.setup.shortDomain ?? config.shortDomain;
    const webApp = config.hostingSiteId ? `${config.hostingSiteId}.web.app` : short;

    return (
        <>
            <div className="page-head"><h1>Setup</h1></div>
            <ErrorNotice error={error} />

            <section className="card">
                <div className="card-head"><h2>Short domain</h2></div>
                <p style={{ marginTop: 0 }}>Links are shared as <strong>https://{short}/&lt;slug&gt;</strong>.{webApp !== short && <> They always work at <code>https://{webApp}</code> too.</>}</p>
                {data?.setup.customDomain ? (
                    data.domain ? (
                        <div className="grid" style={{ gap: 10 }}>
                            <StatusLabel severity={domainSeverity(data.domain)}>
                                {data.domain.active ? `${data.domain.domain} is live` : `${data.domain.domain} is being set up`}
                            </StatusLabel>
                            <div className="card-sub">Host: {data.domain.hostState} · Ownership: {data.domain.ownershipState} · Certificate: {data.domain.certState}</div>
                            {data.domain.records.filter((record) => record.requiredAction !== "NONE").length > 0 && (
                                <>
                                    <p style={{ margin: 0 }}>Add these records at your DNS provider. DNS and the certificate can take up to 24 hours.</p>
                                    <div className="table-wrap">
                                        <table>
                                            <thead><tr><th>Action</th><th>Type</th><th>Name</th><th>Value</th></tr></thead>
                                            <tbody>
                                                {data.domain.records.filter((record) => record.requiredAction !== "NONE").map((record, i) => (
                                                    <tr key={i}>
                                                        <td>{record.requiredAction === "REMOVE" ? "Remove" : "Add"}</td>
                                                        <td>{record.type}</td>
                                                        <td className="mono">{record.domainName}</td>
                                                        <td className="mono" style={{ wordBreak: "break-all" }}>{record.rdata}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : <StatusLabel severity="pending">Waiting for provisioning to attach {data.setup.customDomain}</StatusLabel>
                ) : (
                    <p className="card-sub" style={{ margin: 0 }}>
                        To use your own domain (for example go.yourbrand.com), set the kit's <code>CUSTOM_DOMAIN</code> parameter and redeploy. The DNS records to add will appear here.
                    </p>
                )}
            </section>

            <section className="card">
                <div className="card-head"><h2>Dashboard sign-in</h2></div>
                <StatusLabel severity="good">Google sign-in works for you</StatusLabel>
                <p className="card-sub">
                    To add an admin, add their email to the kit's <code>ADMIN_EMAILS</code> parameter and redeploy, or set the custom claim <code>pocketUrlAdmin: true</code> on their account from your backend.
                    {data && !data.setup.autoAuthorizeDomains && <> Automatic Auth domain setup is off: add {webApp}{data.setup.customDomain ? ` and ${data.setup.customDomain}` : ""} under Authentication → Settings → Authorized domains.</>}
                </p>
            </section>

            <section className="card">
                <div className="card-head"><h2>App links</h2></div>
                <div className="grid" style={{ gap: 10 }}>
                    <div>
                        <StatusLabel severity={data?.setup.iosConfigured ? "good" : "pending"}>
                            iOS universal links {data?.setup.iosConfigured ? "configured" : "not configured"}
                        </StatusLabel>
                        <div className="card-sub">
                            {data?.setup.iosConfigured
                                ? <>Add <code>applinks:{short}</code> to your app's Associated Domains. Check Apple's cached copy: <a href={`https://app-site-association.cdn-apple.com/a/v1/${short}`} target="_blank" rel="noreferrer">AASA on Apple's CDN</a>.</>
                                : <>Set <code>IOS_BUNDLE_ID</code> and <code>IOS_TEAM_ID</code> to serve apple-app-site-association.</>}
                        </div>
                    </div>
                    <div>
                        <StatusLabel severity={data?.setup.androidConfigured ? "good" : "pending"}>
                            Android App Links {data?.setup.androidConfigured ? "configured" : "not configured"}
                        </StatusLabel>
                        <div className="card-sub">
                            {data?.setup.androidConfigured
                                ? <>Add an autoVerify intent filter for <code>{short}</code>. <a href={`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://${short}&relation=delegate_permission/common.handle_all_urls`} target="_blank" rel="noreferrer">Test assetlinks.json</a>.</>
                                : <>Set <code>ANDROID_PACKAGE</code> and <code>ANDROID_SHA256</code> to serve assetlinks.json.</>}
                        </div>
                    </div>
                    <p style={{ margin: 0 }}>When a short link opens your app directly, resolve it to the destination (this also counts the click):</p>
                    <Snippet code={`GET https://${short}/_/resolve/<slug>\n→ { "slug": "...", "url": "https://...", "og": { ... } }`} />
                </div>
            </section>

            <section className="card">
                <div className="card-head"><h2>Create links from your backend</h2></div>
                <Snippet code={`import { createShortLink } from "${config.packageName ?? "@war10ck222/pocket-url"}/admin";

const link = await createShortLink(
    { redirectUrl: "https://example.com/article/42", og: { title: "Article 42" } },
    { shortDomain: "${short}" },
);
console.log(link.shortUrl);`} />
            </section>
        </>
    );
}
