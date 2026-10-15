import { defineBoolean, defineInt, defineString } from "firebase-functions/params";

/**
 * Every value the customer configures at install time. The Firebase CLI reads
 * these declarations to prompt for values and stores the answers in the kit
 * instance's `.env` file. Values are read lazily (inside handlers) through
 * `getConfig()`, never at module load, so discovery works before values exist.
 */

const OPTIONAL = { default: "" } as const;

export const params = {
    hostingSiteId: defineString("HOSTING_SITE_ID", {
        label: "Hosting site ID",
        description:
            "ID of the dedicated Firebase Hosting site that serves your short links and dashboard. " +
            "It is created automatically if it doesn't exist, and becomes <id>.web.app. " +
            "Must be globally unique, at most 30 characters, and must not be your project's default site.",
        input: {
            text: {
                example: "acme-links",
                validationRegex: /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/,
                validationErrorMessage: "Use 1-30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.",
            },
        },
    }),
    siteName: defineString("SITE_NAME", {
        label: "Site name",
        description: "Your brand or app name, shown on link preview pages.",
        input: { text: { example: "Acme", nonEmpty: true } },
    }),
    siteUrl: defineString("SITE_URL", {
        label: "Site URL",
        description:
            "Your main website. Visitors to the root of the short domain are sent here, " +
            "and its host is used for app (universal) links.",
        input: {
            text: {
                example: "https://acme.com",
                validationRegex: /^https?:\/\/[^\s/]+(\/.*)?$/,
                validationErrorMessage: "Enter a full URL starting with https://",
            },
        },
    }),
    adminEmails: defineString("ADMIN_EMAILS", {
        label: "Admin emails",
        description:
            "Comma-separated email addresses allowed to use the dashboard and admin API (Google sign-in). " +
            "Users with the custom claim pocketUrlAdmin=true are also allowed.",
        input: {
            text: {
                example: "you@acme.com,teammate@acme.com",
                validationRegex: /^\s*[^\s,@]+@[^\s,@]+(\s*,\s*[^\s,@]+@[^\s,@]+)*\s*$/,
                validationErrorMessage: "Enter one or more email addresses separated by commas.",
            },
        },
    }),
    customDomain: defineString("CUSTOM_DOMAIN", {
        ...OPTIONAL,
        label: "Custom domain (optional)",
        description:
            "Optional custom domain for short links, e.g. go.acme.com. It is attached to the Hosting site " +
            "automatically; the dashboard then shows the DNS records to add.",
        input: {
            text: {
                example: "go.acme.com",
                validationRegex: /^$|^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
                validationErrorMessage: "Enter a bare domain name such as go.acme.com, or leave blank.",
            },
        },
    }),
    rtdbUrl: defineString("RTDB_URL", {
        ...OPTIONAL,
        label: "Realtime Database URL (optional)",
        description:
            "Realtime Database instance URL to store links and analytics in. Leave blank to use the project's " +
            "default instance (created automatically if it doesn't exist).",
        input: {
            text: {
                example: "https://my-project-links.europe-west1.firebasedatabase.app",
                validationRegex: /^$|^https:\/\/[^\s/]+\/?$/,
                validationErrorMessage: "Enter the database URL (https://...) or leave blank.",
            },
        },
    }),
    databasePath: defineString("DATABASE_PATH", {
        label: "Database path",
        description: "Root path in the Realtime Database for this instance's data. Use a different path per kit instance.",
        default: "dynamicLinksV1",
        input: {
            text: {
                validationRegex: /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/,
                validationErrorMessage: "Use letters, digits, '_' or '-', separated by '/'.",
            },
        },
    }),
    iosBundleId: defineString("IOS_BUNDLE_ID", {
        ...OPTIONAL,
        label: "iOS bundle ID (optional)",
        description: "Bundle identifier of your iOS app. Enables iOS app links and App Store fallbacks.",
        input: { text: { example: "com.acme.app" } },
    }),
    iosTeamId: defineString("IOS_TEAM_ID", {
        ...OPTIONAL,
        label: "Apple team ID (optional)",
        description: "Your Apple Developer team ID, used in apple-app-site-association.",
        input: { text: { example: "ABCDE12345", validationRegex: /^$|^[A-Z0-9]{10}$/, validationErrorMessage: "Team IDs are 10 characters (A-Z, 0-9)." } },
    }),
    iosAppStoreId: defineString("IOS_APP_STORE_ID", {
        ...OPTIONAL,
        label: "App Store ID (optional)",
        description: "Numeric App Store ID of your iOS app. If blank, it is looked up from the bundle ID.",
        input: { text: { example: "1234567890", validationRegex: /^$|^\d+$/, validationErrorMessage: "Digits only." } },
    }),
    androidPackage: defineString("ANDROID_PACKAGE", {
        ...OPTIONAL,
        label: "Android package name (optional)",
        description: "Package name of your Android app. Enables Android app links and Play Store fallbacks.",
        input: { text: { example: "com.acme.app" } },
    }),
    androidSha256: defineString("ANDROID_SHA256", {
        ...OPTIONAL,
        label: "Android SHA-256 fingerprints (optional)",
        description: "Comma-separated SHA-256 signing certificate fingerprints, used in assetlinks.json.",
        input: { text: { example: "14:6D:E9:...:5F" } },
    }),
    androidScheme: defineString("ANDROID_SCHEME", {
        ...OPTIONAL,
        label: "Android intent scheme (optional)",
        description: "Scheme used to open your Android app through an intent URL. Defaults to https.",
        input: { text: { example: "https" } },
    }),
    twitterHandle: defineString("TWITTER_HANDLE", {
        ...OPTIONAL,
        label: "X/Twitter handle (optional)",
        description: "Shown in link preview cards. With or without the leading @.",
    }),
    siteKeywords: defineString("SITE_KEYWORDS", {
        ...OPTIONAL,
        label: "Site keywords (optional)",
        description: "Comma-separated keywords for link preview pages.",
    }),
    siteIconUrl: defineString("SITE_ICON_URL", {
        ...OPTIONAL,
        label: "Site icon URL (optional)",
        description: "URL of a square icon (PNG) used as favicon and touch icon. Defaults to the bundled icon.",
    }),
    themeColor: defineString("THEME_COLOR", {
        label: "Theme color",
        description: "Accent color for preview pages, as a hex value.",
        default: "#031e45",
        input: { text: { validationRegex: /^#[0-9a-fA-F]{6}$/, validationErrorMessage: "Use a hex color like #031e45." } },
    }),
    webApiKey: defineString("WEB_API_KEY", {
        ...OPTIONAL,
        label: "Web API key (optional)",
        description:
            "Only needed if the dashboard can't load /__/firebase/init.json. Your project's browser API key.",
    }),
    clickRetentionDays: defineInt("CLICK_RETENTION_DAYS", {
        label: "Raw click retention (days)",
        description: "How long individual click events are kept. Aggregated counters are kept forever.",
        default: 90,
    }),
    linkCacheSeconds: defineInt("LINK_CACHE_SECONDS", {
        label: "Link cache (seconds)",
        description: "How long each server instance caches a link. Edits and disables take up to this long to apply.",
        default: 30,
    }),
    redirectMinInstances: defineInt("REDIRECT_MIN_INSTANCES", {
        label: "Redirect min instances",
        description: "Keep this many redirect servers warm to avoid cold starts (billed while idle).",
        default: 0,
    }),
    autoAuthorizeDomains: defineBoolean("AUTO_AUTHORIZE_DOMAINS", {
        label: "Authorize dashboard domains in Firebase Auth",
        description:
            "Add the Hosting site (and custom domain) to Firebase Auth's authorized domains automatically. " +
            "Requires granting the Firebase Authentication Admin role to this kit.",
        default: true,
    }),
};

/** Params that must not be blank. */
const REQUIRED = ["HOSTING_SITE_ID", "SITE_NAME", "SITE_URL", "ADMIN_EMAILS"] as const;

/**
 * Fails discovery (and therefore the deploy) when a required value was explicitly
 * left blank in `.env`, rather than failing on the first request. Unset values are
 * allowed so that the CLI can still discover and prompt for them.
 */
export function assertRequiredParams(): void {
    const blank = REQUIRED.filter((name) => process.env[name] !== undefined && process.env[name]?.trim() === "");
    if (blank.length > 0) {
        throw new Error(`Pocket URL: required parameter(s) ${blank.join(", ")} must not be blank.`);
    }
}
