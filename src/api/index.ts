import { onRequest } from "firebase-functions/https";
import { createApiApp } from "./app";

/**
 * Admin API behind Hosting's /api/** rewrite. Invocation is public so Hosting can
 * reach it; access control is the Firebase ID token check inside the app.
 */
export const api = onRequest(
    {
        invoker: "public",
        concurrency: 80,
        memory: "512MiB",
        timeoutSeconds: 120,
    },
    createApiApp(),
);
