import fs from "fs";
import path from "path";
import { TEMPLATES_DIR } from "../common/paths";
import { AppConfig } from "../config";
import { LinkRecord } from "../data/schema";
import { Decision } from "./decide";

const templates = new Map<string, string>();

function template(name: string): string {
    let source = templates.get(name);
    if (source === undefined) {
        source = fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf8");
        templates.set(name, source);
    }
    return source;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** JSON that is safe to embed inside a <script> element. */
export function safeJson(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

/**
 * Fills `{{name}}` placeholders with HTML-escaped values and `{{{name}}}` with
 * pre-built raw markup. A replacer callback is used so `$&`-style sequences in
 * values are inserted literally.
 */
export function renderTemplate(source: string, vars: Record<string, string>, raw: Record<string, string> = {}): string {
    return source.replace(/\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g, (_match, rawKey?: string, key?: string) => {
        if (rawKey) return raw[rawKey] ?? "";
        return escapeHtml(vars[key as string] ?? "");
    });
}

const meta = (attr: "name" | "property", key: string, content: string) =>
    content ? `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(content)}">` : "";

function commonVars(config: AppConfig): Record<string, string> {
    return {
        siteName: config.siteName,
        themeColor: config.themeColor,
        favicon: config.siteIconUrl || "/images/favicon.ico",
        backgroundImage: "/images/background.png",
        statusImage: "/images/status.svg",
        notFoundImage: "/images/not-found.svg",
        siteUrl: config.siteUrl,
    };
}

export interface LinkPageInput {
    link: LinkRecord;
    decision: Extract<Decision, { kind: "preview" | "interstitial" }>;
    config: AppConfig;
    appStoreId: string;
    shortUrl: string;
}

export function renderLinkPage({ link, decision, config, appStoreId, shortUrl }: LinkPageInput): string {
    const title = link.og?.title || config.siteName;
    const description = link.og?.description || "";
    const image = link.og?.image || "";
    const appUrl = decision.kind === "interstitial" ? decision.appUrl : decision.destination;

    const head: string[] = [
        meta("name", "keywords", config.siteKeywords),
        meta("property", "og:image", image),
        meta("name", "twitter:image", image),
        meta("name", "twitter:site", config.twitterHandle ? `@${config.twitterHandle}` : ""),
    ];
    if (config.siteIconUrl) {
        head.push(`<link rel="apple-touch-icon" href="${escapeHtml(config.siteIconUrl)}">`);
    }
    if (config.ios && appStoreId) {
        head.push(
            meta("name", "apple-itunes-app", `app-id=${appStoreId}, app-argument=${appUrl}`),
            meta("property", "al:ios:app_store_id", appStoreId),
            meta("property", "al:ios:app_name", config.siteName),
            meta("property", "al:ios:url", appUrl),
            meta("name", "twitter:app:id:iphone", appStoreId),
            meta("name", "twitter:app:id:ipad", appStoreId),
            meta("name", "twitter:app:url:iphone", appUrl),
            meta("name", "twitter:app:url:ipad", appUrl),
        );
    }
    if (config.android) {
        head.push(
            meta("property", "al:android:package", config.android.packageName),
            meta("property", "al:android:app_name", config.siteName),
            meta("property", "al:android:url", appUrl),
            meta("name", "twitter:app:id:googleplay", config.android.packageName),
        );
    }

    const pageConfig = decision.kind === "interstitial" ? {
        mode: "interstitial",
        platform: decision.platform,
        appUrl: decision.appUrl,
        fallbackUrl: decision.fallbackUrl,
        destination: decision.destination,
        autoRedirect: decision.autoRedirect,
    } : { mode: "preview", destination: decision.destination };

    return renderTemplate(template("index.html"), {
        ...commonVars(config),
        title,
        description,
        canonicalUrl: shortUrl,
        destination: decision.destination,
        openAppLabel: `Open in ${config.siteName}`,
    }, {
        headExtra: head.filter(Boolean).join("\n    "),
        pageConfig: safeJson(pageConfig),
    });
}

export function renderNotFoundPage(config: AppConfig): string {
    return renderTemplate(template("404.html"), commonVars(config));
}
