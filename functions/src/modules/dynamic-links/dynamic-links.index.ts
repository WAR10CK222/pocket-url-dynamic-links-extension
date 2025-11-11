import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import moment from "moment";
import useragent from "useragent";
import { isbot } from "isbot";
import hash from "object-hash";
import geoip from "fast-geoip";

import config from "@/config/index";
import { getAppStoreID } from "@/common/utils/getAppStoreId";
import { database, admin } from "@/common/clients/firebase";
import replaceSpecialCharacters from "@/common/utils/ReplaceSpecialCharacters";
import IAnalytics from "@/common/interfaces/analytics.types";
import { ENV_VARIABLES } from "@/config/env";

const Unknown = "Unknown";

const {
    iosTeamID,
    iosBundleID,
    androidBundleID,
    androidSHA,
    hostname,
    siteurl,
    sitename,
    sitekeywords,
    iosItunesID,
    androidScheme,
    twitterhandle,
    dynamiclinkdomain,
} = config;

export const iOSAssociation = async (request: Request, response: Response) => {
    const applicationID = `${iosTeamID}.${iosBundleID}`;

    response.writeHead(200, { "content-type": "application/json" });
    response.write(
        JSON.stringify({
            applinks: {
                apps: [],
                details: [
                    {
                        appID: applicationID,
                        paths: ["*"],
                    }
                ]
            },
            webcredentials: {
                apps: [applicationID],
            }
        })
    );
    response.end();
};

export const androidAssociation = async (request: Request, response: Response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.write(
        JSON.stringify({
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
                namespace: "android_app",
                package_name: androidBundleID,
                sha256_cert_fingerprints: [androidSHA],
            },
        })
    );
    response.end();
};

export const getNotFoundResponse = () => {
    const notFoundImage = `${dynamiclinkdomain}/images/not-found.svg`;
    const backgroundImage = `${dynamiclinkdomain}/images/background.png`;

    const maskicon = `${dynamiclinkdomain}/images/safari-pinned-tab.svg`;
    const appletouchicon = `${dynamiclinkdomain}/images/apple-touch-icon.png`;
    const favicon = `${dynamiclinkdomain}/images/favicon.ico`;

    const videoUrl = "";

    const templatePath = path.join(ENV_VARIABLES.HTML_FOLDER_PATH, "404.html");
    const source = fs
        .readFileSync(templatePath, { encoding: "utf8" })
        .replace(/{{notFoundImage}}/g, notFoundImage)
        .replace(/{{backgroundImage}}/g, backgroundImage)
        .replace(/{{favicon}}/g, favicon)
        .replace(/{{maskicon}}/g, maskicon)
        .replace(/{{appletouchicon}}/g, appletouchicon)
        .replace(/{{baseurl}}/g, siteurl)
        .replace(/{{videoUrl}}/g, videoUrl)
        .replace(/{{sitename}}/g, sitename)
        .replace(/{{sitekeywords}}/g, sitekeywords)
        .replace(/{{iosItunesID}}/g, iosItunesID || "")
        .replace(/{{hostname}}/g, hostname)
        .replace(/{{appredirect}}/g, "")
        .replace(/{{twitterhandle}}/g, twitterhandle ? twitterhandle : "");

    return source;
};

export const getLinkResponse = async (link: any, os: string) => {
    const title = link["og:title"];
    const description = link["og:description"];
    const image = link["og:image"];

    const redirectToStore = link["redirectToStore"] || false;
    const redirectUrl = link["redirectUrl"];

    const statusImage = `${dynamiclinkdomain}/images/status.svg`;
    // const linkPoweredImage = `${dynamiclinkdomain}/image/link-powered.svg`;
    const backgroundImage = `${dynamiclinkdomain}/images/background.png`;

    const favicon = `${dynamiclinkdomain}/images/favicon.ico`;
    const maskicon = `${dynamiclinkdomain}/images/safari-pinned-tab.svg`;
    const appletouchicon = `${dynamiclinkdomain}/images/apple-touch-icon.png`;

    const baseurl = `https://${hostname}`;
    const videoUrl = "";

    let appStoreID = "";
    if (redirectToStore) {
        appStoreID = (await getAppStoreID(iosBundleID || "")) || "";
    }

    const templatePath = path.join(ENV_VARIABLES.HTML_FOLDER_PATH, "index.html");
    const source = fs
        .readFileSync(templatePath, { encoding: "utf8" })
        .replace(/{{title}}/g, title)
        .replace(/{{description}}/g, description)
        .replace(/{{appStoreID}}/g, appStoreID)
        .replace(/{{androidBundleID}}/g, androidBundleID || "")
        .replace(/{{androidScheme}}/g, androidScheme || "")
        .replace(/{{redirectToStore}}/g, redirectToStore ? "true" : "false")
        .replace(/{{redirectUrl}}/g, redirectUrl || "")
        .replace(/{{appredirectUrl}}/g, redirectUrl || "")
        .replace(/{{thumbnail}}/g, image || "")
        .replace(/{{statusImage}}/g, statusImage)
        .replace(/{{backgroundImage}}/g, backgroundImage)
        .replace(/{{favicon}}/g, favicon)
        .replace(/{{maskicon}}/g, maskicon)
        .replace(/{{appletouchicon}}/g, appletouchicon)
        .replace(/{{baseurl}}/g, baseurl)
        .replace(/{{videoUrl}}/g, videoUrl)
        .replace(/{{sitename}}/g, sitename)
        .replace(/{{sitekeywords}}/g, sitekeywords)
        .replace(/{{iosItunesID}}/g, iosItunesID || "")
        .replace(/{{hostname}}/g, hostname)
        .replace(/{{appredirect}}/g, (new URL(redirectUrl).pathname + new URL(redirectUrl).search) || "")
        .replace(/{{twitterhandle}}/g, twitterhandle || "")
        .replace(/{{osfamily}}/g, os);

    return source;
}

export const mainHandler = async (request: Request, response: Response) => {
    try {
        const { shareId } = request.params;
        const { utm_source = "", utm_medium = "", utm_campaign = "" } = request.query;
        const referrer = request.get("Referer") || "direct";
        const _isBot = isbot(request.get("user-agent"));

        const agent = useragent.parse(request.headers["user-agent"]);
        const browser = agent.family.toString() || Unknown;
        const os = agent.os.toString() || Unknown;
        const deviceType = agent.device.toString() || Unknown;

        const forwarded = request.headers["x-forwarded-for"];
        const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded ? forwarded.split(",")[0] : request.socket.remoteAddress || Unknown;

        const geo = await geoip.lookup(ip);
        const country = geo ? geo.country : Unknown;
        const city = geo ? geo.city : Unknown;
        const region = geo ? geo.region : Unknown;

        const tDate = moment().format("YYYYMMDD")

        const snapshotQuery = database.ref("dynamicLinksV1").child("links").child(shareId);
        const linkSnapshot = await snapshotQuery.get();

        const linkFound = linkSnapshot.exists();

        if (!linkFound) {
            return response.status(404).send(getNotFoundResponse());
        }

        const link = linkSnapshot.val();

        if (link["disabled"] === true) {
            return response.status(404).send(getNotFoundResponse());
        }

        if (link["expireAt"] && moment().isAfter(moment(link["expireAt"]))) {
            return response.status(404).send(getNotFoundResponse());
        }

        const source = await getLinkResponse(link, os);

        if (!(_isBot || link["preview"])) {
            const updates: any = {};
            updates["totalClicks"] = admin.database.ServerValue.increment(1);
            updates[`clickByDate/${tDate}`] = admin.database.ServerValue.increment(1);

            updates[`referrers/${replaceSpecialCharacters(referrer)}/value`] = referrer;
            updates[`referrers/${replaceSpecialCharacters(referrer)}/clickCount`] = admin.database.ServerValue.increment(1);

            updates[`devices/${replaceSpecialCharacters(deviceType)}/value`] = deviceType;
            updates[`devices/${replaceSpecialCharacters(deviceType)}/clickCount`] = admin.database.ServerValue.increment(1);

            updates[`os/${replaceSpecialCharacters(os)}/value`] = os;
            updates[`os/${replaceSpecialCharacters(os)}/clickCount`] = admin.database.ServerValue.increment(1);

            updates[`browsers/${replaceSpecialCharacters(browser)}/value`] = browser;
            updates[`browsers/${replaceSpecialCharacters(browser)}/clickCount`] = admin.database.ServerValue.increment(1);

            updates[`geolocations/country/${replaceSpecialCharacters(country)}`] = admin.database.ServerValue.increment(1);
            updates[`geolocations/city/${replaceSpecialCharacters(city)}`] = admin.database.ServerValue.increment(1);
            updates[`geolocations/region/${replaceSpecialCharacters(region)}`] = admin.database.ServerValue.increment(1);

            updates[`updateTimestamp`] = admin.database.ServerValue.TIMESTAMP;

            if (utm_source || utm_medium || utm_campaign) {
                const utmHash = hash({ utm_source, utm_medium, utm_campaign }, { "algorithm": "md5" });
                updates[`utmData/${utmHash}/clickCount`] = admin.database.ServerValue.increment(1);
                updates[`utmData/${utmHash}/utmParams`] = {
                    utm_source: utm_source || "",
                    utm_medium: utm_medium || "",
                    utm_campaign: utm_campaign || ""
                };
            }

            await snapshotQuery.child("analytics").update(updates);
            await snapshotQuery.child("log").push({
                referrer,
                deviceType,
                os,
                browser,
                country,
                city,
                region,
                timestamp: admin.database.ServerValue.TIMESTAMP,
                date: tDate,
                utmParams: {
                    utm_source: utm_source || "",
                    utm_medium: utm_medium || "",
                    utm_campaign: utm_campaign || ""
                }
            })
        }

        return response.status(200).send(source);
    } catch (error) {
        console.error("Error in mainHandler:", error);
        return response.status(500).send(getNotFoundResponse());
    }
};