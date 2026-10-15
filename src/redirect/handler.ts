import { Request, Response } from "express";
import geoip from "fast-geoip";
import { logger } from "firebase-functions";
import { getAppStoreID } from "../common/utils/getAppStoreId";
import { context } from "../context";
import { ClickEvent } from "../data/analytics.repo";
import { LinkRecord } from "../data/schema";
import { appleAppSiteAssociation, assetLinks, ROBOTS_TXT } from "./association";
import { decide, needsAppStoreLookup } from "./decide";
import { TtlCache } from "./linkCache";
import { renderLinkPage, renderNotFoundPage } from "./render";
import { parseUserAgent, ParsedAgent } from "./userAgent";

const NO_STORE = "private, no-store";
const NEGATIVE_CACHE_SECONDS = 5;

const linkCache = new TtlCache<LinkRecord | null>();

export function clearLinkCache(): void {
    linkCache.clear();
}

async function loadLink(slug: string): Promise<LinkRecord | null> {
    const { config, links } = context();
    return linkCache.get(
        slug,
        (link) => (link ? config.linkCacheSeconds : Math.min(NEGATIVE_CACHE_SECONDS, config.linkCacheSeconds)) * 1000,
        () => links.get(slug),
    );
}

function queryParams(req: Request): URLSearchParams {
    return new URL(req.originalUrl, "http://localhost").searchParams;
}

function clientIp(req: Request): string {
    const forwarded = req.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress ?? "";
    return ip.replace(/^::ffff:/, "");
}

function referrerHost(req: Request): string {
    const referrer = req.get("referer");
    if (!referrer) return "direct";
    try {
        return new URL(referrer).hostname || "direct";
    } catch {
        return "direct";
    }
}

async function buildClickEvent(req: Request, agent: ParsedAgent, source: ClickEvent["source"]): Promise<ClickEvent> {
    const ip = clientIp(req);
    let geo: Awaited<ReturnType<typeof geoip.lookup>> = null;
    if (ip && !ip.includes(":")) {
        try {
            geo = await geoip.lookup(ip);
        } catch {
            geo = null;
        }
    }
    const query = queryParams(req);
    return {
        timestamp: Date.now(),
        referrer: source === "app" ? "app" : referrerHost(req),
        platform: agent.platform,
        deviceType: agent.deviceType,
        os: agent.os,
        browser: agent.browser,
        country: geo?.country || "Unknown",
        city: geo?.city || "Unknown",
        region: geo?.region || "Unknown",
        utmParams: {
            utm_source: query.get("utm_source") ?? "",
            utm_medium: query.get("utm_medium") ?? "",
            utm_campaign: query.get("utm_campaign") ?? "",
        },
        source,
    };
}

/** Analytics must never break a redirect: failures are logged and swallowed. */
async function bestEffort(task: () => Promise<void>): Promise<void> {
    try {
        await task();
    } catch (error) {
        logger.warn("Pocket URL: analytics write failed", { error: String(error) });
    }
}

function shortUrl(req: Request, slug: string): string {
    const { config } = context();
    return `https://${config.shortDomain}/${encodeURIComponent(slug)}`;
}

/** GET /:slug — resolves a short link. */
export async function handleShortLink(req: Request, res: Response): Promise<void> {
    const started = Date.now();
    const slug = String(req.params.slug ?? "");
    const userAgent = req.get("user-agent");
    const agent = parseUserAgent(userAgent);
    const { config, analytics } = context();
    res.set("Cache-Control", NO_STORE);

    try {
        const link = await loadLink(slug);
        const appStoreId = config.ios?.appStoreId ||
            (needsAppStoreLookup(link, agent.platform, config) ? await getAppStoreID(config.ios?.bundleId ?? "") : "");
        const decision = decide(link, {
            isBot: agent.isBot,
            platform: agent.platform,
            inAppBrowser: agent.inAppBrowser,
            query: queryParams(req),
            now: Date.now(),
            appStoreId,
        }, config);

        if (decision.kind === "notFound" || !link) {
            await bestEffort(() => analytics.recordNotFound(slug, agent.isBot));
            res.status(404).type("html").send(renderNotFoundPage(config));
            return;
        }

        // HEAD requests (link checkers), empty user agents and preview links aren't counted.
        const countable = req.method === "GET" && Boolean(userAgent) && !link.preview;
        if (countable && agent.isBot) {
            await bestEffort(() => analytics.recordBot(slug));
        } else if (countable) {
            const event = await buildClickEvent(req, agent, "web");
            await bestEffort(() => analytics.recordClick(slug, event, Date.now() - started));
        }

        if (decision.kind === "redirect") {
            res.redirect(302, decision.location);
            return;
        }
        res.status(200).type("html").send(renderLinkPage({ link, decision, config, appStoreId, shortUrl: shortUrl(req, slug) }));
    } catch (error) {
        logger.error("Pocket URL: failed to serve short link", { slug, error: String(error) });
        await bestEffort(() => analytics.recordError());
        res.status(500).type("html").send(renderNotFoundPage(config));
    }
}

/**
 * GET /_/resolve/:slug — for mobile apps. When a short link opens the app
 * directly (universal links / app links), the app calls this to get the
 * destination. Counts as a click unless `?count=0`.
 */
export async function handleResolve(req: Request, res: Response): Promise<void> {
    const started = Date.now();
    const slug = String(req.params.slug ?? "");
    const agent = parseUserAgent(req.get("user-agent"));
    const { config, analytics } = context();
    res.set({ "Cache-Control": NO_STORE, "Access-Control-Allow-Origin": "*" });

    try {
        const link = await loadLink(slug);
        const decision = decide(link, {
            isBot: false,
            platform: agent.platform,
            inAppBrowser: false,
            query: queryParams(req),
            now: Date.now(),
            appStoreId: config.ios?.appStoreId ?? "",
        }, config);
        if (decision.kind === "notFound" || !link) {
            await bestEffort(() => analytics.recordNotFound(slug, agent.isBot));
            res.status(404).json({ error: "not_found", reason: decision.kind === "notFound" ? decision.reason : "missing" });
            return;
        }
        if (req.query.count !== "0" && !link.preview) {
            const event = await buildClickEvent(req, agent, "app");
            await bestEffort(() => analytics.recordClick(slug, event, Date.now() - started));
        }
        const destination = decision.kind === "redirect" ? decision.location : decision.destination;
        res.json({ slug, url: destination, og: link.og ?? {}, shortUrl: shortUrl(req, slug) });
    } catch (error) {
        logger.error("Pocket URL: failed to resolve short link", { slug, error: String(error) });
        await bestEffort(() => analytics.recordError());
        res.status(500).json({ error: "internal" });
    }
}

export function handleAppleAssociation(_req: Request, res: Response): void {
    const body = appleAppSiteAssociation(context().config);
    if (!body) {
        res.status(404).json({ error: "iOS app not configured" });
        return;
    }
    res.set("Cache-Control", "public, max-age=3600").json(body);
}

export function handleAssetLinks(_req: Request, res: Response): void {
    const body = assetLinks(context().config);
    if (!body) {
        res.status(404).json({ error: "Android app not configured" });
        return;
    }
    res.set("Cache-Control", "public, max-age=3600").json(body);
}

export function handleRobots(_req: Request, res: Response): void {
    res.type("text/plain").set("Cache-Control", "public, max-age=86400").send(ROBOTS_TXT);
}

export function handleRoot(_req: Request, res: Response): void {
    res.set("Cache-Control", NO_STORE).redirect(302, context().config.siteUrl);
}

export async function handleNotFound(req: Request, res: Response): Promise<void> {
    const { config } = context();
    res.set("Cache-Control", NO_STORE).status(404).type("html").send(renderNotFoundPage(config));
}
