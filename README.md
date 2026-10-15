# Pocket URL

Short links and deep links that run in your own Firebase project: a self-hosted replacement for Firebase Dynamic Links, with an analytics dashboard. Distributed as a **Firebase function kit** (an npm package of 2nd gen Cloud Functions).

- **Short links on your domain:** `https://go.yourbrand.com/spring-sale`, or `https://<site>.web.app/...` with no DNS setup at all.
- **App-aware:** opens your iOS/Android app when it's installed (universal links / App Links), otherwise sends people to the App Store, Play Store or a fallback URL. Serves `apple-app-site-association` and `assetlinks.json` for you.
- **Rich previews:** Open Graph and Twitter cards for every link, so shares on social apps and chat unfurl properly.
- **Analytics:** clicks over time, referrers, countries and cities, devices, OS, browsers, UTM campaigns, bot vs human traffic, app opens.
- **Dashboard:** create and edit links, bulk-import from CSV, download QR codes, and monitor 404s, errors, latency and setup status, at `https://<site>.web.app/admin`.
- **Zero manual Hosting setup:** after deploy, a lifecycle task creates the Hosting site, deploys the dashboard and routing, authorizes the domain for sign-in and connects your custom domain.

> **Coming from the Firebase Extension?** Firebase Extensions is deprecated and shuts down on 2027-03-31. Pocket URL 0.1+ ships as a function kit instead; see [Upgrading from 0.0.x](#upgrading-from-00x).

## How it works

```
            ┌────────── Firebase Hosting site <HOSTING_SITE_ID> (created for you) ───────────┐
visitor ──▶ │ static:  /admin/** (dashboard)  /images/**  /.well-known/* (association files)  │
            │ rewrite: /api/** → api function          everything else → redirect function    │
            └─────────────────────────────────────────────────────────────────────────────────┘
functions:  redirect   resolves /<slug>, records analytics
            api        admin REST API (Firebase Auth ID token + admin allowlist)
            provision  runs after every deploy: Hosting site, dashboard, Auth domains, custom domain
            prune      daily cleanup of raw click events past retention
storage:    Realtime Database, under DATABASE_PATH
```

## Requirements

- A Firebase project on the **Blaze** plan.
- Firebase CLI **15.32.0 or later** (`npm i -g firebase-tools`).
- Node.js 22.
- The account that deploys needs permission to grant IAM roles (for example Owner). The kit declares the roles it needs and the CLI grants them to a dedicated service account.

## Quickstart

```bash
cd your-firebase-project
firebase functions:kits:install --package @war10ck222/pocket-url
firebase deploy --only functions:<instance-id>
```

1. `functions:kits:install` asks for a kit instance ID (for example `links`) and the [configuration](#configuration) below. Answers are saved in `function-kits/<kit>/config-<instance>/.env.<project>`.
2. On the first deploy, the CLI lists the roles and APIs the kit needs; confirm (use `--force` in CI).
3. After deploy, the `provision` task runs automatically (one to three minutes). Watch it in the logs, or open `https://<HOSTING_SITE_ID>.web.app/admin` once it's done.
4. In the Firebase console, enable **Authentication → Sign-in method → Google**, then sign in to the dashboard with an email listed in `ADMIN_EMAILS`.

That's it. Create a link in the dashboard and visit `https://<HOSTING_SITE_ID>.web.app/<slug>`.

## Configuration

| Parameter | Required | Default | Description |
|---|---|---|---|
| `FUNCTION_DEFAULT_REGION` | yes | `us-central1` | Region for the functions (asked by the kit wrapper). Must be a region where Hosting can route to Cloud Run. |
| `HOSTING_SITE_ID` | yes | | Dedicated Hosting site for links and the dashboard; becomes `<id>.web.app`. Created if missing. Globally unique, at most 30 characters, never your project's default site. |
| `SITE_NAME` | yes | | Brand or app name shown on preview pages. |
| `SITE_URL` | yes | | Your website. The root of the short domain redirects here, and its host is used for app links. |
| `ADMIN_EMAILS` | yes | | Comma-separated Google accounts allowed into the dashboard and API. |
| `CUSTOM_DOMAIN` | | | For example `go.yourbrand.com`. Attached automatically; the dashboard shows the DNS records to add. |
| `RTDB_URL` | | project default | Realtime Database URL. The default instance is created if the project has none. |
| `DATABASE_PATH` | | `dynamicLinksV1` | Root path for this instance's data. Use a different path per instance. |
| `IOS_BUNDLE_ID`, `IOS_TEAM_ID`, `IOS_APP_STORE_ID` | | | Enable iOS universal links and App Store fallbacks. The App Store ID is looked up from the bundle ID if omitted. |
| `ANDROID_PACKAGE`, `ANDROID_SHA256`, `ANDROID_SCHEME` | | | Enable Android App Links and Play Store fallbacks. Fingerprints are comma-separated. The scheme defaults to `https`. |
| `TWITTER_HANDLE`, `SITE_KEYWORDS`, `SITE_ICON_URL`, `THEME_COLOR` | | | Preview page branding. |
| `WEB_API_KEY` | | | Only if the dashboard can't load `/__/firebase/init.json`: your project's browser API key. |
| `CLICK_RETENTION_DAYS` | | `90` | How long raw click events are kept. Aggregated counters are kept forever. |
| `LINK_CACHE_SECONDS` | | `30` | Per-server link cache. Edits and disables take up to this long to apply. |
| `REDIRECT_MIN_INSTANCES` | | `0` | Warm redirect servers to avoid cold starts (billed while idle). |
| `AUTO_AUTHORIZE_DOMAINS` | | `true` | Add the site and custom domain to Firebase Auth authorized domains. Set `false` to skip the Firebase Authentication Admin role and add them yourself. |

Change a value by editing the instance's `.env` file and redeploying; provisioning reruns and applies it.

## Roles and APIs

The kit declares these with `requiresRole` / `requiresAPI`; the CLI grants them to the instance's managed service account at deploy time.

| Role | Why |
|---|---|
| `roles/firebasedatabase.admin` | Read and write links and analytics; create the default database if missing. |
| `roles/firebasehosting.admin` | Create the Hosting site, deploy and release versions, connect the custom domain. |
| `roles/cloudfunctions.viewer`, `roles/run.viewer` | Look up the functions' Cloud Run services to route Hosting traffic to them. |
| `roles/cloudtasks.enqueuer`, `roles/run.invoker` | Re-run provisioning from the dashboard. |
| `roles/firebaseauth.viewer` | Check that dashboard sessions haven't been revoked. |
| `roles/firebaseauth.admin` | Only when `AUTO_AUTHORIZE_DOMAINS` is true: add authorized domains. |

APIs enabled: Firebase Hosting, Realtime Database, Cloud Functions, Cloud Run, Cloud Tasks, Cloud Scheduler, and Identity Toolkit (when `AUTO_AUTHORIZE_DOMAINS` is true).

## Provisioning

`provision` is a task queue function wired to the `afterFirstDeploy` and `afterRedeploy` lifecycle hooks. Every run is idempotent:

1. Ensures the Realtime Database exists and migrates 0.0.x data (see below).
2. Finds this instance's `redirect` and `api` Cloud Run services.
3. Creates the Hosting site if needed. It never touches the default site, or a site with content it didn't deploy.
4. Uploads the dashboard, images, generated association files and `robots.txt`, with rewrites to the functions. It skips the deploy when nothing changed.
5. Adds `<site>.web.app`, `<site>.firebaseapp.com` and your custom domain to Firebase Auth authorized domains.
6. Connects `CUSTOM_DOMAIN` and records the DNS records to add.

Status, warnings and errors appear on the dashboard's **Operations** page and in Cloud Logging. Rerun it with the **Re-run** button or from the CLI:

```bash
firebase functions:lifecycle:run afterRedeploy <instance-id>
```

## Custom domain

Set `CUSTOM_DOMAIN` (for example `go.yourbrand.com`) and redeploy. The **Setup** page lists the DNS records to add at your DNS provider and shows certificate status. DNS and SSL can take up to 24 hours. Until then, links work on `<site>.web.app`.

## Mobile apps

**iOS:** set `IOS_BUNDLE_ID` and `IOS_TEAM_ID`, then add `applinks:<short domain>` to your app's Associated Domains.
**Android:** set `ANDROID_PACKAGE` and `ANDROID_SHA256`, then add an `autoVerify` intent filter for the short domain.

When a short link opens your app directly, the app gets the short URL. Resolve it to the destination (this also counts the click):

```http
GET https://<short domain>/_/resolve/<slug>
→ { "slug": "spring-sale", "url": "https://yourbrand.com/sale", "og": { ... }, "shortUrl": "..." }
```

Add `?count=0` to resolve without counting.

Per link, **Open in the app** (`redirectToStore`) controls the browser fallback when the app didn't open:
- **iOS:** the App Store (or `iosFallbackUrl`).
- **Android:** an intent URL that opens the app, or the Play Store (or `androidFallbackUrl`).
- **In-app browsers** (Instagram, Facebook and similar, where universal links don't fire) get a page with "Open in app" and "Get the app" buttons.

## Creating links

**Dashboard.** Use **Links → New link**, or **Import CSV** with columns `url` (required), `slug`, `title`, `description`, `image`, `tags`.

**From your backend** (same project), with the Admin SDK helper:

```ts
import { createShortLink } from "@war10ck222/pocket-url/admin";

const link = await createShortLink(
    { redirectUrl: "https://yourbrand.com/article/42", og: { title: "Article 42" } },
    { shortDomain: "go.yourbrand.com" },   // plus databaseUrl / path if you changed RTDB_URL / DATABASE_PATH
);
// link.slug, link.shortUrl
```

`getShortLink`, `updateShortLink` and `deleteShortLink` are exported too. This entry point declares no params, so importing it doesn't affect your other deploys.

### Link fields

| Field | Description |
|---|---|
| `redirectUrl` | Destination (http or https only). |
| `slug` | Optional custom slug: 1–64 letters, digits, `-` or `_`. Generated (7 characters) if omitted. |
| `og.title`, `og.description`, `og.image` | Preview card. |
| `redirectToStore` | Open the app on iOS and Android, with store fallback. |
| `iosFallbackUrl`, `androidFallbackUrl`, `desktopUrl` | Per-platform destinations. |
| `forwardQuery` | Pass the short link's query string to the destination. |
| `expireAt` | Epoch milliseconds; the link 404s afterwards. |
| `disabled` | The link 404s. |
| `preview` | Test link: works, but clicks aren't counted. |
| `tags` | Free-form labels. |

### REST API

All endpoints live under `/api/v1` on the Hosting site and need `Authorization: Bearer <Firebase ID token>` from an admin account. Responses use the envelope `{ success, statusCode, message, data }`.

| Method and path | Description |
|---|---|
| `GET /me` | Current user and whether they're an admin. |
| `GET /links?q=&status=&cursor=&limit=` | List links (slug-prefix search, status filter, paging) with click totals. |
| `POST /links` | Create a link. Returns 409 if the slug is taken. |
| `POST /links/batch` | Create up to 500 links, with a result per row. |
| `GET` · `PATCH` · `DELETE /links/:slug` | Read, update, or delete a link (deleting also removes its analytics). |
| `GET /links/:slug/stats?from=YYYYMMDD&to=YYYYMMDD` | Daily series plus all-time breakdowns. |
| `GET /links/:slug/clicks?days=7&limit=100` | Recent raw clicks. |
| `GET /stats/overview?from=&to=` | Project-wide totals, series and top lists. |
| `GET /ops?from=&to=` | 404s, errors, latency, provisioning and domain status, console links. |
| `POST /ops/provision` | Queue a provisioning run. |

## Analytics and privacy

Each human click is recorded with one atomic database write before the redirect. Bots and link unfurlers are counted separately and see the preview card instead of a redirect. `HEAD` requests and test links aren't counted.

**Stored per click:**
- referrer host
- platform, device type, OS and browser
- country, region and city (IPv4 lookup with the bundled GeoLite database)
- UTM parameters
- timestamp

**IP addresses are never stored.** Raw clicks are kept for `CLICK_RETENTION_DAYS`; per-link and daily counters are kept indefinitely.

**Data layout** (under `DATABASE_PATH`):

```
links/{slug}                   link config only (small, cached per server)
analytics/{slug}               per-link counters and breakdowns
clicks/{YYYYMMDD}/{slug}/{id}  raw click events, bucketed by day for cheap retention
stats/daily/{YYYYMMDD}         project-wide daily totals
ops/daily/{YYYYMMDD}           404s, errors and latency buckets
meta                           schema version, link count, provisioning and domain status
```

The kit uses the Admin SDK, so your database security rules can stay locked (`".read": false, ".write": false`).

## Monitoring

The **Operations** page shows:
- 404s and the most-requested missing slugs, each with a one-click "Create link"
- server errors
- redirect latency percentiles
- provisioning status and warnings
- deep links to Cloud Logging and the redirect function's Cloud Run metrics

Errors are logged as structured JSON. Individual clicks aren't logged, to keep Cloud Logging costs down.

## Multiple instances

Install the kit again with another instance ID (for example one per brand). Give each instance its own `HOSTING_SITE_ID` and `DATABASE_PATH`. Functions deploy as `kit-<instance>-<name>`.

## Billing

The kit uses Cloud Functions (2nd gen), Realtime Database, Hosting, Cloud Tasks and Cloud Scheduler. Every product has a free tier.

- Each instance uses one Cloud Scheduler job. Cloud Scheduler includes 3 free jobs per billing account.
- `REDIRECT_MIN_INSTANCES` above 0 bills for idle instances.
- The GeoLite database makes the function package large (about 160 MB unpacked). That affects build time, not runtime cost.

## Upgrading from 0.0.x

Version 0.0.x was an unpublished Firebase Extension. Moving to the kit:

1. Install the kit with the **same `DATABASE_PATH`** (`dynamicLinksV1`). On first provisioning, links that still carry nested `analytics` and `log` data are migrated: counters are merged into `analytics/{slug}`, log entries within retention move to `clicks/{day}`, and legacy `og:*` fields are normalized. The migration is resumable and safe to rerun.
2. Parameter renames:

   | 0.0.x | 0.1+ |
   |---|---|
   | `HOSTNAME`, `SITEURL` | `SITE_URL` (host derived from it) |
   | `SITENAME`, `SITEKEYWORDS`, `SITEICON`, `TWITTERHANDLE` | `SITE_NAME`, `SITE_KEYWORDS`, `SITE_ICON_URL`, `TWITTER_HANDLE` |
   | `DYNAMICLINKDOMAIN` | `HOSTING_SITE_ID` / `CUSTOM_DOMAIN` |
   | `IOSAPP`, `ANDROIDAPP` | removed: enabled when a bundle ID or package is set |
   | `IOSBUNDLEID`, `IOSTEAMID`, `IOSITUNESID` | `IOS_BUNDLE_ID`, `IOS_TEAM_ID`, `IOS_APP_STORE_ID` |
   | `ANDROIDBUNDLEID`, `ANDROIDSHA`, `ANDROIDSCHEME` | `ANDROID_PACKAGE`, `ANDROID_SHA256`, `ANDROID_SCHEME` |

3. If you installed the extension, uninstall it after switching DNS: `firebase ext:uninstall <instance-id>`.

## Uninstall

```bash
firebase functions:kits:uninstall --instance <instance-id>
```

This removes the functions and the instance config. The Hosting site and database data are kept: delete the site in the Firebase console (**Hosting**), and the `DATABASE_PATH` node in the Realtime Database, if you no longer need them.

## Development

```bash
npm install && npm --prefix dashboard install
npm run build            # kit (tsc) + dashboard (Vite → lib/dashboard)
npm test                 # unit tests (vitest)
npm run test:integration # API, redirects, analytics, migration and retention against the emulators (Java 21)
npm run lint && npm run typecheck
```

**Dashboard development against the emulators:**

```bash
npm run dev:server                                         # seeded API on :5055, redirects on :5056
cp dashboard/.env.example dashboard/.env.local             # set VITE_API_PROXY=http://127.0.0.1:5055
npm --prefix dashboard run dev                             # http://localhost:5173/admin/
```

`example/` is a Firebase project that runs the kit as a standalone codebase, the way `functions:kits:install` wraps it. Releases are published from GitHub Actions; see `.github/workflows/release.yml`.

## Known limitations

- iPadOS Safari identifies as macOS, so iPads get the desktop behavior.
- Geolocation covers IPv4 addresses only. IPv6 clicks are recorded with an unknown location.
- Link edits take up to `LINK_CACHE_SECONDS` to reach every server.

## License

Apache-2.0. This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com (via `fast-geoip`).
