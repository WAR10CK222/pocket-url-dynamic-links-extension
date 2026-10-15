import { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { adminApp } from "../common/clients/firebase";
import { EHttpStatusCode } from "../common/interfaces/commonbackend.types";
import { getConfig } from "../config";
import { apiError } from "./http";

export interface TokenClaims {
    uid: string;
    email?: string;
    email_verified?: boolean;
    pocketUrlAdmin?: unknown;
}

export const ADMIN_CLAIM = "pocketUrlAdmin";

/**
 * An admin either carries the `pocketUrlAdmin: true` custom claim (set by your own
 * backend) or has a verified email that appears in ADMIN_EMAILS.
 */
export function isAdmin(token: TokenClaims, adminEmails: string[]): boolean {
    if (token[ADMIN_CLAIM] === true) return true;
    if (!token.email || token.email_verified !== true) return false;
    return adminEmails.includes(token.email.toLowerCase());
}

/** Verifies the Firebase ID token in `Authorization: Bearer <token>`. */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
        next(apiError(EHttpStatusCode.UNAUTHENTICATED, "Missing bearer token", { code: "UNAUTHENTICATED" }));
        return;
    }
    try {
        const decoded = await getAuth(adminApp()).verifyIdToken(match[1], true);
        res.locals.user = decoded as TokenClaims;
        next();
    } catch {
        next(apiError(EHttpStatusCode.UNAUTHENTICATED, "Invalid or expired token", { code: "UNAUTHENTICATED" }));
    }
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
    const user = res.locals.user as TokenClaims | undefined;
    if (!user || !isAdmin(user, getConfig().adminEmails)) {
        next(apiError(EHttpStatusCode.UNAUTHORIZED, "This account is not a Pocket URL admin", { code: "NOT_ADMIN" }));
        return;
    }
    next();
}

export function currentUser(res: Response): TokenClaims {
    return res.locals.user as TokenClaims;
}
