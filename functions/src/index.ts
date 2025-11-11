import { onRequest } from "firebase-functions/v2/https";
import app from "./app";

export const shareHandler = onRequest({ cors: true, concurrency: 1000 }, app);