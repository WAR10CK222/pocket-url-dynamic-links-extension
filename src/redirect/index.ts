import { onRequest } from "firebase-functions/https";
import { params } from "../params";
import { createRedirectApp } from "./app";

/** Public short-link resolver. Firebase Hosting rewrites every unmatched path here. */
export const redirect = onRequest(
    {
        invoker: "public",
        concurrency: 250,
        memory: "512MiB",
        timeoutSeconds: 30,
        minInstances: params.redirectMinInstances,
    },
    createRedirectApp(),
);
