import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { createApi } from "./api";
import { useToast } from "./components/ui";
import { errorText } from "./format";
import { Runtime } from "./firebase";
import { AppContext } from "./hooks";
import { href, Route, useRoute } from "./route";
import { applyThemeChoice, readThemeChoice, ThemeChoice } from "./theme";
import { LinkDetailPage } from "./pages/LinkDetail";
import { LinksPage } from "./pages/Links";
import { OpsPage } from "./pages/Ops";
import { OverviewPage } from "./pages/Overview";
import { SetupPage } from "./pages/Setup";
import { NotAdminPage, SignInPage } from "./pages/SignIn";

const NAV: Array<{ label: string; route: Route }> = [
    { label: "Overview", route: { page: "overview" } },
    { label: "Links", route: { page: "links" } },
    { label: "Operations", route: { page: "ops" } },
    { label: "Setup", route: { page: "setup" } },
];

type Access = { state: "loading" } | { state: "signedOut" } | { state: "notAdmin"; user: User } | { state: "admin"; user: User } | { state: "error"; message: string };

export function App({ runtime }: { runtime: Runtime }) {
    const { auth, config } = runtime;
    const api = useMemo(() => createApi(auth, config.apiBase), [auth, config.apiBase]);
    const [access, setAccess] = useState<Access>({ state: "loading" });
    const [toastMessage, toast] = useToast();
    const [theme, setTheme] = useState<ThemeChoice>(readThemeChoice);
    const route = useRoute();

    useEffect(() => applyThemeChoice(theme), [theme]);

    useEffect(() => onAuthStateChanged(auth, async (user) => {
        if (!user) {
            setAccess({ state: "signedOut" });
            return;
        }
        setAccess({ state: "loading" });
        try {
            const me = await api.me();
            setAccess(me.admin ? { state: "admin", user } : { state: "notAdmin", user });
        } catch (err) {
            setAccess({ state: "error", message: errorText(err) });
        }
    }), [auth, api]);

    if (access.state === "loading") return <div className="signin"><div className="card-sub">Loading…</div></div>;
    if (access.state === "signedOut") return <SignInPage auth={auth} siteName={config.siteName} projectId={config.projectId} />;
    if (access.state === "notAdmin") return <NotAdminPage auth={auth} email={access.user.email} />;
    if (access.state === "error") {
        return (
            <div className="signin">
                <div className="card">
                    <h1>Couldn't reach the API</h1>
                    <div className="notice critical">{access.message}</div>
                    <button type="button" onClick={() => signOut(auth)}>Sign out</button>
                </div>
            </div>
        );
    }

    const current = route.page === "link" ? "links" : route.page;
    return (
        <AppContext.Provider value={{ api, config, toast }}>
            <div className="shell">
                <header className="topbar">
                    <div className="brand">{config.siteName}<small>links</small></div>
                    <nav className="nav" aria-label="Main">
                        {NAV.map((item) => (
                            <a key={item.label} href={href(item.route)} aria-current={item.route.page === current ? "page" : undefined}>{item.label}</a>
                        ))}
                    </nav>
                    <div className="user">
                        <select aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)}>
                            <option value="system">System</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                        <span className="card-sub">{access.user.email}</span>
                        <button type="button" onClick={() => signOut(auth)}>Sign out</button>
                    </div>
                </header>
                <main className="content">
                    {route.page === "overview" && <OverviewPage />}
                    {route.page === "links" && <LinksPage />}
                    {route.page === "link" && <LinkDetailPage key={route.slug} slug={route.slug} />}
                    {route.page === "ops" && <OpsPage />}
                    {route.page === "setup" && <SetupPage />}
                </main>
            </div>
            {toastMessage && <div className="toast" role="status">{toastMessage}</div>}
        </AppContext.Provider>
    );
}
