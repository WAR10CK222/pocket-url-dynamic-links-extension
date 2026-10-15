import { Database } from "firebase-admin/database";
import { getDb } from "./common/clients/firebase";
import { AppConfig, getConfig } from "./config";
import { AnalyticsRepo } from "./data/analytics.repo";
import { LinksRepo } from "./data/links.repo";

export interface Context {
    config: AppConfig;
    db: Database;
    links: LinksRepo;
    analytics: AnalyticsRepo;
}

let cached: Context | null = null;

/** Lazily wires config, database and repositories once per server instance. */
export function context(): Context {
    if (!cached) {
        const config = getConfig();
        const db = getDb(config.rtdbUrl || undefined);
        cached = {
            config,
            db,
            links: new LinksRepo(db, config.databasePath),
            analytics: new AnalyticsRepo(db, config.databasePath),
        };
    }
    return cached;
}

export function setContextForTests(value: Context | null): void {
    cached = value;
}
