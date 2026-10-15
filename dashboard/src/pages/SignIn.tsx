import { Auth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";

const PROVIDER_ERRORS: Record<string, string> = {
    "auth/operation-not-allowed": "Google sign-in isn't enabled for this project yet.",
    "auth/unauthorized-domain": "This domain isn't in Firebase Auth's authorized domains yet.",
    "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups for this site and try again.",
};

export function SignInPage({ auth, siteName, projectId }: { auth: Auth; siteName: string; projectId: string }) {
    const [error, setError] = useState<{ code: string; message: string } | null>(null);
    const [busy, setBusy] = useState(false);

    const signIn = async () => {
        setBusy(true);
        setError(null);
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (err) {
            const code = (err as { code?: string }).code ?? "";
            if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
                setError({ code, message: PROVIDER_ERRORS[code] ?? (err as Error).message });
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="signin">
            <div className="card">
                <h1>{siteName} links</h1>
                <p className="card-sub" style={{ margin: 0 }}>Sign in with an admin Google account.</p>
                <button type="button" className="primary" onClick={signIn} disabled={busy} style={{ justifyContent: "center" }}>
                    {busy ? "Signing in…" : "Sign in with Google"}
                </button>
                {error && (
                    <div className="notice critical" role="alert" style={{ textAlign: "left" }}>
                        {error.message}
                        {error.code === "auth/operation-not-allowed" && projectId && (
                            <> <a href={`https://console.firebase.google.com/project/${projectId}/authentication/providers`} target="_blank" rel="noreferrer">Enable Google in the Firebase console</a>, then try again.</>
                        )}
                        {error.code === "auth/unauthorized-domain" && projectId && (
                            <> Add <code>{location.hostname}</code> in <a href={`https://console.firebase.google.com/project/${projectId}/authentication/settings`} target="_blank" rel="noreferrer">Authentication settings</a>, or rerun provisioning.</>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export function NotAdminPage({ auth, email }: { auth: Auth; email: string | null }) {
    return (
        <div className="signin">
            <div className="card">
                <h1>No access</h1>
                <p style={{ margin: 0 }}>
                    <strong>{email ?? "This account"}</strong> isn't a Pocket URL admin. Ask an admin to add your email to the kit's <code>ADMIN_EMAILS</code> parameter.
                </p>
                <button type="button" onClick={() => signOut(auth)} style={{ justifyContent: "center" }}>Use a different account</button>
            </div>
        </div>
    );
}
