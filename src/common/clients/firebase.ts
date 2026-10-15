import { App, getApps, initializeApp } from "firebase-admin/app";
import { Database, getDatabaseWithUrl } from "firebase-admin/database";

export function adminApp(): App {
    return getApps()[0] ?? initializeApp();
}

function firebaseConfig(): { projectId?: string; databaseURL?: string } {
    try {
        return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}");
    } catch {
        return {};
    }
}

export function projectId(): string {
    return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig().projectId || "";
}

/** The project's default Realtime Database URL, falling back to the conventional default instance name. */
export function defaultDatabaseUrl(): string {
    return firebaseConfig().databaseURL || `https://${projectId()}-default-rtdb.firebaseio.com`;
}

export function getDb(url?: string): Database {
    return getDatabaseWithUrl(url || defaultDatabaseUrl(), adminApp());
}
