import { NextFunction, Request, Response } from "express";
import { logger } from "firebase-functions";
import { ZodError } from "zod";
import { APIError } from "../common/errors/error.types";
import {
    EHttpStatusCode,
    ResponseMessage,
    THttpError,
    THttpResponse,
} from "../common/interfaces/commonbackend.types";
import { LinkNotFoundError, SlugTakenError } from "../data/links.repo";

/** Request summary for response envelopes. IP addresses are deliberately omitted. */
const requestInfo = (req: Request) => ({ ip: null, method: req.method, url: req.originalUrl });

export function ok(req: Request, res: Response, data: unknown, statusCode: number = EHttpStatusCode.OK): void {
    const body: THttpResponse = {
        success: true,
        statusCode,
        request: requestInfo(req),
        message: ResponseMessage.SUCCESS,
        data,
    };
    res.status(statusCode).set("Cache-Control", "private, no-store").json(body);
}

export const apiError = (statusCode: EHttpStatusCode, message: string, data: object | null = null) =>
    new APIError(statusCode, message, true, data);

export function notFoundRoute(req: Request, _res: Response, next: NextFunction): void {
    next(apiError(EHttpStatusCode.NOT_FOUND, ResponseMessage.NOT_FOUND));
}

/** Maps known errors to HTTP responses using the shared THttpError envelope. */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
    let statusCode: number = EHttpStatusCode.INTERNAL_SERVER_ERROR;
    let message = ResponseMessage.INTERNAL_SERVER_ERROR;
    let data: unknown = null;

    if (error instanceof APIError) {
        statusCode = error.statusCode;
        message = error.message;
        data = error.data;
    } else if (error instanceof ZodError) {
        statusCode = EHttpStatusCode.BAD_REQUEST;
        message = ResponseMessage.BAD_REQUEST;
        data = { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
    } else if (error instanceof SlugTakenError) {
        statusCode = EHttpStatusCode.CONFLICT;
        message = error.message;
    } else if (error instanceof LinkNotFoundError) {
        statusCode = EHttpStatusCode.NOT_FOUND;
        message = error.message;
    } else if ((error as { type?: string })?.type === "entity.parse.failed") {
        statusCode = EHttpStatusCode.BAD_REQUEST;
        message = "Request body must be valid JSON";
    } else {
        logger.error("Pocket URL API: unhandled error", { error: String(error), path: req.path });
    }

    const body: THttpError = {
        success: false,
        statusCode,
        request: requestInfo(req),
        message,
        data,
        trace: null,
    };
    res.status(statusCode).set("Cache-Control", "private, no-store").json(body);
}
