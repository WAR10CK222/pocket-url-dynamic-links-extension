import express, { Request, Response, Router } from "express";
import { authenticate, currentUser, isAdmin, requireAdmin } from "./auth";
import { getConfig } from "../config";
import { errorHandler, notFoundRoute, ok } from "./http";
import { linksRouter } from "./routes/links";
import { opsRouter } from "./routes/ops";
import { statsRouter } from "./routes/stats";

/**
 * Admin REST API, served at /api/v1 through the Hosting rewrite. Every route
 * needs a Firebase ID token; everything except /me also needs admin access.
 */
export function createApiApp(): express.Express {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);
    app.use(express.json({ limit: "2mb" }));

    const v1 = Router();
    v1.use(authenticate);
    v1.get("/me", (req: Request, res: Response) => {
        const user = currentUser(res);
        ok(req, res, { uid: user.uid, email: user.email ?? null, admin: isAdmin(user, getConfig().adminEmails) });
    });
    v1.use(requireAdmin);
    v1.use("/links", linksRouter());
    v1.use("/stats", statsRouter());
    v1.use("/ops", opsRouter());

    app.use("/api/v1", v1);
    app.use(notFoundRoute);
    app.use(errorHandler);
    return app;
}
