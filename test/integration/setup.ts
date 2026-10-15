/**
 * Runs inside `firebase emulators:exec --only database,auth`, which sets
 * FIREBASE_DATABASE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.
 * Params are read from process.env, exactly as in a deployed function.
 */
process.env.GCLOUD_PROJECT ??= "demo-pocket-url";
process.env.HOSTING_SITE_ID = "demo-links";
process.env.SITE_NAME = "Demo";
process.env.SITE_URL = "https://demo.example.com";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.DATABASE_PATH = "integration";
process.env.RTDB_URL = "";
process.env.CUSTOM_DOMAIN = "";
process.env.CLICK_RETENTION_DAYS = "30";
process.env.LINK_CACHE_SECONDS = "0";

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Integration tests must run under the emulators: npm run test:integration");
}
