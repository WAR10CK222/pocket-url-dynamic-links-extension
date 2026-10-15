import fs from "fs";
import path from "path";

/** Package root: `lib/common/paths.js` (or `src/common/paths.ts` in tests) → two levels up. */
export const PKG_ROOT = path.resolve(__dirname, "..", "..");
export const ASSETS_DIR = path.join(PKG_ROOT, "assets");
export const TEMPLATES_DIR = path.join(ASSETS_DIR, "templates");
export const IMAGES_DIR = path.join(ASSETS_DIR, "images");
/** The dashboard build is written to lib/dashboard by `npm run build:dashboard`. */
export const DASHBOARD_DIR = path.join(PKG_ROOT, "lib", "dashboard");

let pkg: { name: string; version: string } | undefined;

function packageInfo(): { name: string; version: string } {
    if (pkg === undefined) {
        try {
            const parsed = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));
            pkg = { name: String(parsed.name ?? "pocket-url"), version: String(parsed.version ?? "0.0.0") };
        } catch {
            pkg = { name: "pocket-url", version: "0.0.0" };
        }
    }
    return pkg;
}

export function packageVersion(): string {
    return packageInfo().version;
}

export function packageName(): string {
    return packageInfo().name;
}
