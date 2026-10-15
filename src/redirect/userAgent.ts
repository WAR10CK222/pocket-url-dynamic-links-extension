import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";

export type Platform = "ios" | "android" | "desktop";

export interface ParsedAgent {
    isBot: boolean;
    platform: Platform;
    /** Embedded browsers (Instagram, Facebook, ...) where universal links don't open apps. */
    inAppBrowser: boolean;
    deviceType: string;
    os: string;
    browser: string;
}

const IN_APP_BROWSER = /\b(FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Snapchat|Twitter|TikTok|musical_ly|Pinterest|GSA\/|MicroMessenger)\b/i;

export function parseUserAgent(userAgent: string | undefined): ParsedAgent {
    const ua = userAgent ?? "";
    const result = new UAParser(ua).getResult();
    const osName = result.os.name ?? "";
    let platform: Platform = "desktop";
    if (osName === "iOS") platform = "ios";
    else if (osName === "Android") platform = "android";

    return {
        isBot: isbot(ua),
        platform,
        inAppBrowser: IN_APP_BROWSER.test(ua),
        deviceType: result.device.type ?? "desktop",
        os: osName || "Unknown",
        browser: result.browser.name ?? "Unknown",
    };
}
