import { FirebaseOptions, initializeApp } from "firebase/app";
import { Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { RuntimeConfig } from "./types";

export interface Runtime {
    config: RuntimeConfig;
    auth: Auth;
}

const env = import.meta.env;

/** Values written by the provision task to /admin/config.json; env vars in local dev. */
async function loadRuntimeConfig(): Promise<RuntimeConfig> {
    try {
        const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: "no-store" });
        if (res.ok) return (await res.json()) as RuntimeConfig;
    } catch {
        // Fall through to development defaults.
    }
    return {
        projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
        instanceId: "",
        version: "dev",
        apiBase: "/api/v1",
        siteName: env.VITE_SITE_NAME ?? "Pocket URL",
        shortDomain: env.VITE_SHORT_DOMAIN ?? location.host,
        hostingSiteId: "",
        webApiKey: env.VITE_FIREBASE_API_KEY ?? "",
    };
}

/**
 * Firebase Auth only needs apiKey, authDomain and projectId. Hosting serves them at
 * /__/firebase/init.json for every site in the project, so no web app has to be
 * registered. WEB_API_KEY is the fallback when that file isn't available.
 */
async function loadFirebaseOptions(config: RuntimeConfig): Promise<FirebaseOptions> {
    if (env.VITE_FIREBASE_API_KEY) {
        return {
            apiKey: env.VITE_FIREBASE_API_KEY,
            authDomain: `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
            projectId: env.VITE_FIREBASE_PROJECT_ID,
        };
    }
    try {
        const res = await fetch("/__/firebase/init.json", { cache: "no-store" });
        if (res.ok) {
            const options = (await res.json()) as FirebaseOptions;
            if (options.apiKey) return options;
        }
    } catch {
        // Fall through to the configured key.
    }
    if (config.webApiKey) {
        return { apiKey: config.webApiKey, authDomain: `${config.projectId}.firebaseapp.com`, projectId: config.projectId };
    }
    throw new Error(
        "Couldn't load the Firebase configuration from /__/firebase/init.json. " +
        "Set the kit's WEB_API_KEY parameter to your project's browser API key and redeploy.");
}

export async function initRuntime(): Promise<Runtime> {
    const config = await loadRuntimeConfig();
    const app = initializeApp(await loadFirebaseOptions(config));
    const auth = getAuth(app);
    if (env.VITE_AUTH_EMULATOR_URL) connectAuthEmulator(auth, env.VITE_AUTH_EMULATOR_URL, { disableWarnings: true });
    return { config, auth };
}
