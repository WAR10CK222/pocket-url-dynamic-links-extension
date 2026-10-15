import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { gzipSync } from "zlib";
import { DASHBOARD_DIR, IMAGES_DIR, packageName } from "../common/paths";
import { AppConfig } from "../config";
import { appleAppSiteAssociation, assetLinks, ROBOTS_TXT } from "../redirect/association";

export interface HostingFile {
    /** URL path, starting with "/". */
    path: string;
    gzipped: Buffer;
    /** SHA-256 (hex) of the gzipped bytes, as the Hosting API requires. */
    hash: string;
}

/** Gzips once and hashes the compressed bytes; the same buffer is uploaded. */
export function prepareFile(urlPath: string, content: Buffer | string): HostingFile {
    const gzipped = gzipSync(typeof content === "string" ? Buffer.from(content, "utf8") : content, { level: 9 });
    return { path: urlPath, gzipped, hash: createHash("sha256").update(gzipped).digest("hex") };
}

/** Recursively lists a directory as [urlPath, absolutePath] pairs under `urlPrefix`. */
export function listDirectory(dir: string, urlPrefix: string): Array<[string, string]> {
    if (!fs.existsSync(dir)) return [];
    const out: Array<[string, string]> = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        const urlPath = `${urlPrefix}/${entry.name}`;
        if (entry.isDirectory()) out.push(...listDirectory(absolute, urlPath));
        else if (entry.isFile()) out.push([urlPath, absolute]);
    }
    return out;
}

export interface SiteFilesInput {
    config: AppConfig;
    projectId: string;
    instanceId: string;
    version: string;
    dashboardDir?: string;
    imagesDir?: string;
}

export interface DashboardRuntimeConfig {
    projectId: string;
    instanceId: string;
    version: string;
    packageName: string;
    apiBase: string;
    siteName: string;
    shortDomain: string;
    hostingSiteId: string;
    webApiKey: string;
}

/** Everything the Hosting site serves statically. Generated files reflect current params. */
export function buildSiteFiles(input: SiteFilesInput): { files: HostingFile[]; dashboardIncluded: boolean } {
    const { config } = input;
    const files: HostingFile[] = [];

    for (const [urlPath, absolute] of listDirectory(input.imagesDir ?? IMAGES_DIR, "/images")) {
        files.push(prepareFile(urlPath, fs.readFileSync(absolute)));
    }

    const dashboardFiles = listDirectory(input.dashboardDir ?? DASHBOARD_DIR, "/admin");
    for (const [urlPath, absolute] of dashboardFiles) {
        files.push(prepareFile(urlPath, fs.readFileSync(absolute)));
    }
    const runtimeConfig: DashboardRuntimeConfig = {
        projectId: input.projectId,
        instanceId: input.instanceId,
        version: input.version,
        packageName: packageName(),
        apiBase: "/api/v1",
        siteName: config.siteName,
        shortDomain: config.shortDomain,
        hostingSiteId: config.hostingSiteId,
        webApiKey: config.webApiKey,
    };
    files.push(prepareFile("/admin/config.json", JSON.stringify(runtimeConfig, null, 2)));

    const aasa = appleAppSiteAssociation(config);
    if (aasa) files.push(prepareFile("/.well-known/apple-app-site-association", JSON.stringify(aasa)));
    const links = assetLinks(config);
    if (links) files.push(prepareFile("/.well-known/assetlinks.json", JSON.stringify(links)));
    files.push(prepareFile("/robots.txt", ROBOTS_TXT));

    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, dashboardIncluded: dashboardFiles.some(([urlPath]) => urlPath === "/admin/index.html") };
}

/** Stable fingerprint of a deploy: serving config plus every file's hash. */
export function deployFingerprint(servingConfig: object, files: HostingFile[]): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(servingConfig));
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
        hash.update(`\n${file.path}:${file.hash}`);
    }
    return hash.digest("hex");
}
