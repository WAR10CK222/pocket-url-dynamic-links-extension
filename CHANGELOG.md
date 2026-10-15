# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

First release as a Firebase function kit. Firebase Extensions is deprecated (shutting down 2027-03-31), so the extension packaging is replaced by an npm package of 2nd gen functions.

### Added
- Automatic provisioning after every deploy:
  - creates the dedicated Hosting site
  - deploys the dashboard, assets, association files and rewrites
  - authorizes the domains for Firebase Auth
  - connects the custom domain and records its DNS records
  - creates the default Realtime Database if missing
- Admin dashboard at `/admin`, with Google sign-in and an admin allowlist:
  - analytics overview and per-link analytics
  - link management and CSV import
  - QR codes with UTM presets
  - operations page (404s, errors, latency, provisioning status) and setup checklist
- Admin REST API (`/api/v1`) and an Admin SDK helper (`@war10ck222/pocket-url/admin`).
- `/_/resolve/:slug` endpoint for mobile apps opened by universal links / App Links.
- Per-link platform destinations (`iosFallbackUrl`, `androidFallbackUrl`, `desktopUrl`), query forwarding and tags.
- Bot vs human counting, project-wide daily stats, 404, error and latency counters, and a daily retention job.

### Changed
- Humans get a server-side 302 for plain links. The interstitial page is only used for app links; bots get the preview card.
- Each link's config is stored separately from its analytics, so a click reads a few hundred bytes instead of the link's whole history. Each click is one atomic write.
- Analytics keys use a reversible encoding, so labels like `www.instagram.com` display correctly.
- Parameter names, with defaults derived where possible; see "Upgrading from 0.0.x" in the README.

### Fixed
- `assetlinks.json` is now a JSON array, so Android App Links verification works.
- Link pages escape every value, so a link's title or destination can no longer inject HTML or script.
- Missing or invalid destinations no longer cause 500 errors.
- The build no longer emits unresolved `@/` path aliases.
- `axios` was only a dev dependency but was needed at runtime; it has been replaced with `fetch`.
- The Express error handler is now registered correctly.
- The double `@` in Twitter handles.
- References to images that didn't exist.

### Removed
- `extension.yaml`, `PREINSTALL.md` and `POSTINSTALL.md` (Firebase Extensions packaging).

## [0.0.1]

### Added
- Initial unpublished Firebase Extension.
