#!/usr/bin/env node
/**
 * Release helpers used by .github/workflows/{ci,release}.yml.
 *
 *   node scripts/release.cjs version <rc|stable>   prints version=<v> and tag=<next|latest> for $GITHUB_OUTPUT
 *   node scripts/release.cjs prune-shrinkwrap      drops dev-only entries from npm-shrinkwrap.json
 *   node scripts/release.cjs check-pack            fails if the npm tarball is missing files or ships extras
 *   node scripts/release.cjs notes <version>       prints the CHANGELOG section for a version
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
// Windows can only spawn npm.cmd through a shell (Node >= 20.12).
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const shell = process.platform === "win32";

function publishedVersions() {
    try {
        const out = execFileSync(npm, ["view", pkg.name, "versions", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell });
        const parsed = JSON.parse(out);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return []; // Not published yet.
    }
}

function version(stage) {
    const base = pkg.version.replace(/-.*$/, "");
    const published = publishedVersions();
    if (published.includes(base)) {
        throw new Error(`${pkg.name}@${base} is already published. Bump "version" in package.json and add a CHANGELOG entry.`);
    }
    if (stage === "stable") {
        console.log(`version=${base}`);
        console.log("tag=latest");
        return;
    }
    if (stage !== "rc") throw new Error(`Unknown stage "${stage}" (use rc or stable)`);
    const rcs = published
        .map((v) => new RegExp(`^${base.replace(/\./g, "\\.")}-rc\\.(\\d+)$`).exec(v))
        .filter(Boolean)
        .map((match) => Number(match[1]));
    const next = rcs.length ? Math.max(...rcs) + 1 : 0;
    console.log(`version=${base}-rc.${next}`);
    console.log("tag=next");
}

/** The Cloud Functions build runs `npm ci`; dev-only entries can fail it with EBADPLATFORM. */
function pruneShrinkwrap() {
    const file = path.join(root, "npm-shrinkwrap.json");
    const shrinkwrap = JSON.parse(fs.readFileSync(file, "utf8"));
    let removed = 0;
    for (const [key, entry] of Object.entries(shrinkwrap.packages ?? {})) {
        if (key !== "" && entry.dev) {
            delete shrinkwrap.packages[key];
            removed++;
        }
    }
    if (shrinkwrap.packages?.[""]) delete shrinkwrap.packages[""].devDependencies;
    fs.writeFileSync(file, `${JSON.stringify(shrinkwrap, null, 2)}\n`);
    console.log(`Removed ${removed} dev-only entries from npm-shrinkwrap.json`);
}

function checkPack() {
    const out = execFileSync(npm, ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8", shell });
    const files = JSON.parse(out)[0].files.map((file) => file.path.replace(/\\/g, "/"));
    const required = [
        "package.json", "README.md", "CHANGELOG.md", "LICENSE", "npm-shrinkwrap.json",
        "lib/index.js", "lib/index.d.ts", "lib/admin.js", "lib/admin.d.ts",
        "lib/dashboard/index.html", "assets/templates/index.html", "assets/templates/404.html",
    ];
    const missing = required.filter((file) => !files.includes(file));
    const forbidden = files.filter((file) => /^(src|test|dashboard|example|scripts|functions|\.github)\//.test(file) || /\.env/.test(file));
    if (missing.length || forbidden.length) {
        if (missing.length) console.error(`Missing from package: ${missing.join(", ")}`);
        if (forbidden.length) console.error(`Should not be packaged: ${forbidden.join(", ")}`);
        process.exit(1);
    }
    console.log(`Package contents OK (${files.length} files)`);
}

function notes(target) {
    const base = target.replace(/-.*$/, "");
    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    const match = new RegExp(`^## \\[${base.replace(/\./g, "\\.")}\\][^\\n]*\\n([\\s\\S]*?)(?=^## \\[|$(?![\\s\\S]))`, "m").exec(changelog);
    if (!match) throw new Error(`No CHANGELOG entry for ${base}`);
    console.log(match[1].trim());
}

const [command, arg] = process.argv.slice(2);
try {
    if (command === "version") version(arg);
    else if (command === "prune-shrinkwrap") pruneShrinkwrap();
    else if (command === "check-pack") checkPack();
    else if (command === "notes") notes(arg ?? pkg.version);
    else throw new Error("Usage: release.cjs version <rc|stable> | prune-shrinkwrap | check-pack | notes <version>");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
