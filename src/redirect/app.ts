import express, { NextFunction, Request, Response } from "express";
import { logger } from "firebase-functions";
import { IMAGES_DIR } from "../common/paths";
import {
    handleAppleAssociation,
    handleAssetLinks,
    handleNotFound,
    handleResolve,
    handleRobots,
    handleRoot,
    handleShortLink,
} from "./handler";

/**
 * Public short-link server. Behind Firebase Hosting, static files (images,
 * association files, the dashboard) are served by Hosting and everything else
 * is rewritten here; the static routes below are fallbacks for direct access.
 */
export function createRedirectApp(): express.Express {
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", true);

    app.get("/.well-known/apple-app-site-association", handleAppleAssociation);
    app.get("/.well-known/assetlinks.json", handleAssetLinks);
    app.get("/robots.txt", handleRobots);
    app.use("/images", express.static(IMAGES_DIR, { maxAge: "7d", fallthrough: false }));
    app.get("/", handleRoot);
    app.get("/_/resolve/:slug", handleResolve);
    app.get("/:slug", handleShortLink);
    app.all("/{*splat}", handleNotFound);

    // Express only treats 4-argument middleware as an error handler.
    app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
        const status = (error as { status?: number })?.status;
        if (status === 404) {
            void handleNotFound(req, res);
            return;
        }
        logger.error("Pocket URL: unhandled error", { error: String(error), path: req.path });
        res.status(500).set("Cache-Control", "private, no-store").send("Internal Server Error");
    });
    return app;
}
