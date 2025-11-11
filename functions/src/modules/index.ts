import { Router } from "express";
const router = Router();

import { iOSAssociation, androidAssociation, mainHandler } from "./dynamic-links/dynamic-links.index"

router.get("/.well-known/assetlinks.json", androidAssociation);
router.get("/.well-known/apple-app-site-association", iOSAssociation);
router.get("/:shareId", mainHandler);

export default router;