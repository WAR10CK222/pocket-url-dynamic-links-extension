/**
 * Local development server for the dashboard: runs the admin API and redirect
 * apps against the Realtime Database and Auth emulators, seeded with demo data.
 *
 *   npm run dev:server                  (terminal 1)
 *   npm --prefix dashboard run dev      (terminal 2, with dashboard/.env.local from .env.example,
 *                                        VITE_API_PROXY=http://127.0.0.1:5055)
 *
 * Sign in on the emulator's Google popup with the email in ADMIN_EMAILS below.
 */
const path = require("path");

process.env.GCLOUD_PROJECT ??= "demo-pocket-url";
Object.assign(process.env, {
    HOSTING_SITE_ID: "demo-links",
    SITE_NAME: "Demo",
    SITE_URL: "https://demo.example.com",
    ADMIN_EMAILS: process.env.ADMIN_EMAILS || "admin@example.com",
    DATABASE_PATH: "dynamicLinksV1",
    IOS_BUNDLE_ID: "com.example.app",
    IOS_TEAM_ID: "ABCDE12345",
    IOS_APP_STORE_ID: "1234567890",
    ANDROID_PACKAGE: "com.example.app",
    ANDROID_SHA256: "AA:BB:CC",
    LINK_CACHE_SECONDS: "5",
});

const lib = path.join(__dirname, "..", "lib");
const { createApiApp } = require(path.join(lib, "api", "app.js"));
const { createRedirectApp } = require(path.join(lib, "redirect", "app.js"));
const { context } = require(path.join(lib, "context.js"));
const { dateKey } = require(path.join(lib, "common", "dates.js"));
const { rel } = require(path.join(lib, "data", "paths.js"));

// Small deterministic PRNG so the demo data looks the same on every run.
let seed = 42;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (items) => {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = random() * total;
    for (const [value, weight] of items) if ((roll -= weight) <= 0) return value;
    return items[0][0];
};

async function seedData() {
    const { links, analytics, db, config } = context();
    const root = db.ref(config.databasePath);
    if ((await root.child("meta/seeded").get()).val()) return;

    const demo = [
        { slug: "spring-sale", redirectUrl: "https://demo.example.com/sale", og: { title: "Spring sale: 30% off", description: "This week only." }, tags: ["campaign"] },
        { slug: "app", redirectUrl: "https://demo.example.com/download", redirectToStore: true, og: { title: "Get the Demo app" } },
        { slug: "docs", redirectUrl: "https://demo.example.com/docs", forwardQuery: true },
        { slug: "webinar", redirectUrl: "https://demo.example.com/webinar", expireAt: Date.now() - 86400000 },
        { slug: "old-blog", redirectUrl: "https://demo.example.com/blog", disabled: true },
    ];
    for (const link of demo) await links.create(link, "seed");

    const weights = [["spring-sale", 6], ["app", 4], ["docs", 2]];
    const now = Date.now();
    for (let i = 0; i < 1500; i++) {
        const daysAgo = Math.floor(random() ** 1.6 * 30);
        const timestamp = now - daysAgo * 86400000 - Math.floor(random() * 86400000 * 0.9);
        const platform = pick([["ios", 4], ["android", 3], ["desktop", 3]]);
        const campaign = pick([["", 6], ["spring", 3], ["newsletter", 2]]);
        await analytics.recordClick(pick(weights), {
            timestamp,
            referrer: pick([["direct", 5], ["t.co", 3], ["www.instagram.com", 3], ["news.ycombinator.com", 1], ["mail.google.com", 2]]),
            platform,
            deviceType: platform === "desktop" ? "desktop" : pick([["mobile", 5], ["tablet", 1]]),
            os: { ios: "iOS", android: "Android", desktop: pick([["Windows", 3], ["Mac OS", 2], ["Linux", 1]]) }[platform],
            browser: { ios: "Mobile Safari", android: "Chrome", desktop: pick([["Chrome", 4], ["Safari", 1], ["Firefox", 1], ["Edge", 1]]) }[platform],
            country: pick([["IN", 5], ["US", 4], ["GB", 2], ["DE", 1], ["BR", 1]]),
            city: pick([["Pune", 3], ["Mumbai", 2], ["New York", 2], ["London", 2], ["Berlin", 1]]),
            region: pick([["MH", 4], ["NY", 2], ["ENG", 2], ["BE", 1]]),
            utmParams: { utm_source: campaign ? "email" : "", utm_medium: campaign ? "email" : "", utm_campaign: campaign },
            source: random() < 0.1 ? "app" : "web",
        }, Math.floor(20 + random() ** 2 * 900));
    }

    const updates = {};
    for (let d = 0; d < 30; d++) {
        const day = dateKey(now - d * 86400000);
        updates[`${rel.statsDay(day)}/bots`] = Math.floor(10 + random() * 40);
        updates[`${rel.opsDay(day)}/notFound/summer-sale`] = Math.floor(random() * 6);
        updates[`${rel.opsDay(day)}/notFound/promo`] = Math.floor(random() * 3);
        updates[`${rel.opsDay(day)}/notFoundOther`] = Math.floor(random() * 12);
        if (random() < 0.2) updates[`${rel.opsDay(day)}/errors`] = 1 + Math.floor(random() * 3);
    }
    updates[rel.provisioning] = {
        state: "ready",
        step: "done",
        reason: "redeploy",
        version: "0.1.0",
        siteUrl: "https://demo-links.web.app",
        dashboardUrl: "https://demo-links.web.app/admin",
        finishedAt: now - 3600000,
        skippedDeploy: false,
        warnings: ["Couldn't limit stored Hosting versions to 10 (demo warning)."],
        region: "us-central1",
        services: { redirect: { id: "kit-demo-redirect", serviceId: "kit-demo-redirect", region: "us-central1" } },
    };
    updates["meta/seeded"] = true;
    await root.update(updates);
    console.log("Seeded demo data");
}

seedData().then(() => {
    createApiApp().listen(5055, () => console.log("Admin API on http://127.0.0.1:5055/api/v1"));
    createRedirectApp().listen(5056, () => console.log("Short links on http://127.0.0.1:5056/<slug>"));
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
