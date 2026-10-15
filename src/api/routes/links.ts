import { Request, Response, Router } from "express";
import { z } from "zod";
import { resolveRange } from "../../common/dates";
import { EHttpStatusCode } from "../../common/interfaces/commonbackend.types";
import { context } from "../../context";
import { createLinkSchema, LinkRecord, updateLinkSchema } from "../../data/schema";
import { currentUser } from "../auth";
import { apiError, ok } from "../http";
import { clickSeries, rankBreakdown, rankCounters, summarizeUtm } from "../summaries";

const BATCH_LIMIT = 500;
const batchSchema = z.object({ links: z.array(z.unknown()).min(1).max(BATCH_LIMIT) });

type LinkStatus = "active" | "disabled" | "expired";

export function linkStatus(link: LinkRecord, now = Date.now()): LinkStatus {
    if (link.disabled) return "disabled";
    if (typeof link.expireAt === "number" && now >= link.expireAt) return "expired";
    return "active";
}

function shortUrl(slug: string): string {
    return `https://${context().config.shortDomain}/${encodeURIComponent(slug)}`;
}

function slugParam(req: Request): string {
    return String(req.params.slug ?? "");
}

export function linksRouter(): Router {
    const router = Router();

    router.get("/", async (req: Request, res: Response) => {
        const { links, analytics } = context();
        const status = typeof req.query.status === "string" ? req.query.status : "";
        const page = await links.list({
            cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
            limit: Number(req.query.limit) || 100,
            prefix: typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined,
        });
        const filtered = status ? page.links.filter((link) => linkStatus(link) === status) : page.links;
        const withTotals = await Promise.all(filtered.map(async (link) => ({
            ...link,
            status: linkStatus(link),
            shortUrl: shortUrl(link.slug),
            ...(await analytics.getLinkTotals(link.slug)),
        })));
        ok(req, res, { links: withTotals, nextCursor: page.nextCursor });
    });

    router.post("/", async (req: Request, res: Response) => {
        const input = createLinkSchema.parse(req.body);
        const link = await context().links.create(input, currentUser(res).email ?? currentUser(res).uid);
        ok(req, res, { ...link, status: linkStatus(link), shortUrl: shortUrl(link.slug) }, EHttpStatusCode.CREATED);
    });

    /** Bulk create (CSV import). Each row succeeds or fails independently. */
    router.post("/batch", async (req: Request, res: Response) => {
        const { links: rows } = batchSchema.parse(req.body);
        const createdBy = currentUser(res).email ?? currentUser(res).uid;
        const results: Array<{ index: number; ok: boolean; slug?: string; shortUrl?: string; error?: string }> = [];
        const queue = rows.map((row, index) => ({ row, index }));
        const worker = async () => {
            for (let item = queue.shift(); item; item = queue.shift()) {
                const parsed = createLinkSchema.safeParse(item.row);
                if (!parsed.success) {
                    results.push({ index: item.index, ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`).join("; ") });
                    continue;
                }
                try {
                    const link = await context().links.create(parsed.data, createdBy);
                    results.push({ index: item.index, ok: true, slug: link.slug, shortUrl: shortUrl(link.slug) });
                } catch (error) {
                    results.push({ index: item.index, ok: false, error: (error as Error).message });
                }
            }
        };
        await Promise.all(Array.from({ length: 8 }, worker));
        results.sort((a, b) => a.index - b.index);
        ok(req, res, { results, created: results.filter((result) => result.ok).length });
    });

    router.get("/:slug", async (req: Request, res: Response) => {
        const slug = slugParam(req);
        const { links, analytics } = context();
        const link = await links.get(slug);
        if (!link) throw apiError(EHttpStatusCode.NOT_FOUND, `No link with slug "${slug}".`);
        ok(req, res, { slug, ...link, status: linkStatus(link), shortUrl: shortUrl(slug), ...(await analytics.getLinkTotals(slug)) });
    });

    router.patch("/:slug", async (req: Request, res: Response) => {
        const slug = slugParam(req);
        const patch = updateLinkSchema.parse(req.body);
        const link = await context().links.update(slug, patch);
        ok(req, res, { ...link, status: linkStatus(link), shortUrl: shortUrl(slug) });
    });

    router.delete("/:slug", async (req: Request, res: Response) => {
        const slug = slugParam(req);
        await context().links.delete(slug);
        ok(req, res, { slug, deleted: true });
    });

    router.get("/:slug/stats", async (req: Request, res: Response) => {
        const slug = slugParam(req);
        const range = resolveRange(req.query.from, req.query.to);
        const data = await context().analytics.getLinkAnalytics(slug) as Record<string, unknown>;
        const geo = (data.geolocations ?? {}) as Record<string, unknown>;
        ok(req, res, {
            slug,
            range,
            totals: {
                totalClicks: typeof data.totalClicks === "number" ? data.totalClicks : 0,
                botClicks: typeof data.botClicks === "number" ? data.botClicks : 0,
            },
            series: clickSeries(range.from, range.to, data.clickByDate),
            // Breakdowns below are all-time totals.
            referrers: rankBreakdown(data.referrers),
            devices: rankBreakdown(data.devices),
            os: rankBreakdown(data.os),
            browsers: rankBreakdown(data.browsers),
            countries: rankCounters(geo.country),
            regions: rankCounters(geo.region),
            cities: rankCounters(geo.city),
            utm: summarizeUtm(data.utmData),
            updatedAt: typeof data.updateTimestamp === "number" ? data.updateTimestamp : null,
        });
    });

    router.get("/:slug/clicks", async (req: Request, res: Response) => {
        const slug = slugParam(req);
        const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const clicks = await context().analytics.getRecentClicks(slug, days, limit);
        ok(req, res, { slug, days, clicks });
    });

    return router;
}
