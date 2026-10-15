import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { gunzipSync } from "zlib";
import { deployVersion } from "../../src/provision/deploy";
import { buildSiteFiles, deployFingerprint, prepareFile } from "../../src/provision/files";
import { GcpError } from "../../src/provision/gcp";
import { buildServingConfig } from "../../src/provision/hostingConfig";
import { HostingClient, normalizeVersionName, summarizeCustomDomain } from "../../src/provision/hostingClient";
import { shouldSkipDeploy } from "../../src/provision/run";
import { resolveKitFunctions } from "../../src/provision/serviceIds";
import { testConfig } from "../helpers";

describe("prepareFile", () => {
    it("hashes the gzipped bytes and round-trips the content", () => {
        const file = prepareFile("/robots.txt", "hello");
        expect(file.hash).toBe(createHash("sha256").update(file.gzipped).digest("hex"));
        expect(gunzipSync(file.gzipped).toString()).toBe("hello");
        expect(prepareFile("/x", "hello").hash).toBe(file.hash); // deterministic
    });
});

describe("buildSiteFiles", () => {
    it("includes dashboard, images, generated association files and runtime config", () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pocket-url-"));
        fs.mkdirSync(path.join(tmp, "dash", "assets"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "dash", "index.html"), "<html></html>");
        fs.writeFileSync(path.join(tmp, "dash", "assets", "app.js"), "console.log(1)");
        fs.mkdirSync(path.join(tmp, "img"));
        fs.writeFileSync(path.join(tmp, "img", "logo.svg"), "<svg/>");

        const { files, dashboardIncluded } = buildSiteFiles({
            config: testConfig(),
            projectId: "acme-prod",
            instanceId: "links",
            version: "1.2.3",
            dashboardDir: path.join(tmp, "dash"),
            imagesDir: path.join(tmp, "img"),
        });
        const paths = files.map((file) => file.path);
        expect(dashboardIncluded).toBe(true);
        expect(paths).toEqual(expect.arrayContaining([
            "/admin/index.html",
            "/admin/assets/app.js",
            "/admin/config.json",
            "/images/logo.svg",
            "/.well-known/apple-app-site-association",
            "/.well-known/assetlinks.json",
            "/robots.txt",
        ]));
        const runtime = JSON.parse(gunzipSync(files.find((file) => file.path === "/admin/config.json")!.gzipped).toString());
        expect(runtime).toMatchObject({ projectId: "acme-prod", instanceId: "links", apiBase: "/api/v1", shortDomain: "acme-links.web.app" });
    });

    it("omits association files for unconfigured apps", () => {
        const { files, dashboardIncluded } = buildSiteFiles({
            config: testConfig({ iosBundleId: "", androidPackage: "" }),
            projectId: "p",
            instanceId: "",
            version: "1",
            dashboardDir: path.join(os.tmpdir(), "does-not-exist-pocket-url"),
        });
        expect(dashboardIncluded).toBe(false);
        expect(files.some((file) => file.path.startsWith("/.well-known/"))).toBe(false);
    });
});

describe("buildServingConfig", () => {
    it("routes the API first and everything else to the redirect function last", () => {
        const config = buildServingConfig({
            api: { serviceId: "kit-links-api", region: "us-central1" },
            redirect: { serviceId: "kit-links-redirect", region: "us-central1" },
        });
        expect(config.appAssociation).toBe("NONE");
        expect(config.rewrites[0]).toEqual({ glob: "/api/**", run: { serviceId: "kit-links-api", region: "us-central1" } });
        expect(config.rewrites[config.rewrites.length - 1]).toEqual({ glob: "**", run: { serviceId: "kit-links-redirect", region: "us-central1" } });
        expect(config.headers[0].headers["Content-Type"]).toBe("application/json");
    });

    it("fingerprints change when files or config change", () => {
        const config = buildServingConfig({ api: { serviceId: "a", region: "r" }, redirect: { serviceId: "b", region: "r" } });
        const base = deployFingerprint(config, [prepareFile("/a", "1")]);
        expect(deployFingerprint(config, [prepareFile("/a", "1")])).toBe(base);
        expect(deployFingerprint(config, [prepareFile("/a", "2")])).not.toBe(base);
        expect(deployFingerprint({ ...config, appAssociation: "AUTO" }, [prepareFile("/a", "1")])).not.toBe(base);
    });
});

describe("shouldSkipDeploy", () => {
    it("skips only when the fingerprint matches and our release is still live", () => {
        const previous = { lastDeployHash: "h", lastVersionName: "sites/s/versions/1" };
        expect(shouldSkipDeploy(previous, "h", "sites/s/versions/1")).toBe(true);
        expect(shouldSkipDeploy(previous, "other", "sites/s/versions/1")).toBe(false);
        expect(shouldSkipDeploy(previous, "h", "sites/s/versions/2")).toBe(false);
        expect(shouldSkipDeploy({}, "h", null)).toBe(false);
        // The live release may report the projects/... form of the same version.
        expect(shouldSkipDeploy(previous, "h", "projects/123/sites/s/versions/1")).toBe(true);
    });
});

describe("deployVersion", () => {
    it("uploads only the files Hosting asks for, then finalizes and releases", async () => {
        const files = [prepareFile("/a.txt", "a"), prepareFile("/b.txt", "b")];
        const calls: string[] = [];
        const fake = {
            createVersion: async () => {
                calls.push("createVersion");
                return { name: "projects/1/sites/s/versions/v1" };
            },
            populateFiles: async (_version: string, map: Record<string, string>) => {
                calls.push(`populate:${Object.keys(map).sort().join(",")}`);
                return { uploadRequiredHashes: [files[1].hash], uploadUrl: "https://upload/x" };
            },
            uploadFile: async (url: string, hash: string) => {
                calls.push(`upload:${url}/${hash === files[1].hash ? "b" : "?"}`);
            },
            finalizeVersion: async () => {
                calls.push("finalize");
            },
            createRelease: async (_site: string, version: string, message: string) => {
                calls.push(`release:${version}:${message}`);
                return { name: "r" };
            },
        } as unknown as HostingClient;

        const result = await deployVersion(fake, "s", {}, files, "msg");
        expect(result).toEqual({ versionName: "projects/1/sites/s/versions/v1", uploaded: 1 });
        expect(calls).toEqual([
            "createVersion",
            "populate:/a.txt,/b.txt",
            "upload:https://upload/x/b",
            "finalize",
            "release:projects/1/sites/s/versions/v1:msg",
        ]);
    });

    it("retries version creation while a new site propagates", async () => {
        let attempts = 0;
        const fake = {
            createVersion: async () => {
                attempts++;
                if (attempts < 2) throw new GcpError("not found", 404, null);
                return { name: "v" };
            },
            populateFiles: async () => ({}),
            finalizeVersion: async () => undefined,
            createRelease: async () => ({ name: "r" }),
        } as unknown as HostingClient;
        vi.useFakeTimers();
        const promise = deployVersion(fake, "s", {}, [prepareFile("/a", "a")], "m");
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toMatchObject({ versionName: "v" });
        vi.useRealTimers();
        expect(attempts).toBe(2);
    });
});

describe("resolveKitFunctions", () => {
    const fn = (id: string, region = "us-central1", service = id.toLowerCase()) => ({
        name: `projects/p/locations/${region}/functions/${id}`,
        serviceConfig: { service: `projects/p/locations/${region}/services/${service}`, uri: `https://${service}.run.app` },
    });

    it("derives the prefix from the provision function's own service", () => {
        const result = resolveKitFunctions(
            [fn("kit-links-redirect"), fn("kit-links-api"), fn("kit-links-provision"), fn("kit-other-redirect")],
            "kit-links-provision",
            undefined,
        );
        expect(result.prefix).toBe("kit-links-");
        expect(result.redirect?.serviceId).toBe("kit-links-redirect");
        expect(result.api?.id).toBe("kit-links-api");
        expect(result.region).toBe("us-central1");
    });

    it("falls back to the kit instance ID and reads real service IDs", () => {
        const result = resolveKitFunctions([fn("kit-x-redirect", "europe-west1", "kit-x--redirect"), fn("kit-x-api")], undefined, "x");
        expect(result.redirect).toMatchObject({ serviceId: "kit-x--redirect", region: "europe-west1" });
    });

    it("works for standalone (unprefixed) deploys", () => {
        const result = resolveKitFunctions([fn("redirect"), fn("api"), fn("provision")], "provision", undefined);
        expect(result.prefix).toBe("");
        expect(result.redirect?.id).toBe("redirect");
    });
});

describe("normalizeVersionName", () => {
    it("strips the projects/<id>/ prefix", () => {
        expect(normalizeVersionName("projects/123/sites/s/versions/v")).toBe("sites/s/versions/v");
        expect(normalizeVersionName("sites/s/versions/v")).toBe("sites/s/versions/v");
        expect(normalizeVersionName(undefined)).toBeNull();
    });
});

describe("summarizeCustomDomain", () => {
    it("flattens DNS records and reports activity", () => {
        const summary = summarizeCustomDomain("go.acme.com", {
            name: "x",
            hostState: "HOST_ACTIVE",
            ownershipState: "OWNERSHIP_ACTIVE",
            cert: { state: "CERT_ACTIVE" },
            requiredDnsUpdates: { desired: [{ domainName: "go.acme.com", records: [{ domainName: "go.acme.com", type: "A", rdata: "1.2.3.4", requiredAction: "ADD" }] }] },
        });
        expect(summary.active).toBe(true);
        expect(summary.records).toEqual([{ domainName: "go.acme.com", type: "A", rdata: "1.2.3.4", requiredAction: "ADD" }]);
        expect(summarizeCustomDomain("go.acme.com", null)).toMatchObject({ found: false, active: false, records: [] });
    });
});
