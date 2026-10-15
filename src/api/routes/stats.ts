import { Request, Response, Router } from "express";
import { resolveRange } from "../../common/dates";
import { context } from "../../context";
import { ok } from "../http";
import { overviewFromDaily } from "../summaries";

export function statsRouter(): Router {
    const router = Router();

    router.get("/overview", async (req: Request, res: Response) => {
        const { analytics, links } = context();
        const range = resolveRange(req.query.from, req.query.to);
        const [daily, linkCount] = await Promise.all([
            analytics.getDailyStats(range.from, range.to),
            links.count(),
        ]);
        ok(req, res, { range, linkCount, ...overviewFromDaily(range.from, range.to, daily) });
    });

    return router;
}
