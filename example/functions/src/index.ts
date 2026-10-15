/**
 * Mirrors the wrapper that `firebase functions:kits:install` generates
 * (firebase-tools templates/init/functions/typescript/index-kit.ts).
 */
import { setGlobalOptions } from "firebase-functions";
import * as params from "firebase-functions/params";

export const regionParam = params.defineString("FUNCTION_DEFAULT_REGION", {
    input: { text: { nonEmpty: true } },
    default: "us-central1",
    description: "Global default region where functions should be deployed. Can be overriden per-function.",
});

setGlobalOptions({ region: regionParam, maxInstances: 20 });

// Exports the functions located in the kit.
export * from "@war10ck/pocket-url";
