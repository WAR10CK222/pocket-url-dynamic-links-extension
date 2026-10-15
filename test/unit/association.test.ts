import { appleAppSiteAssociation, assetLinks } from "../../src/redirect/association";
import { testConfig } from "../helpers";

describe("assetLinks", () => {
    it("is a JSON array with every fingerprint, uppercased", () => {
        const links = assetLinks(testConfig());
        expect(Array.isArray(links)).toBe(true);
        expect(links).toEqual([{
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: "com.acme.app", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] },
        }]);
    });

    it("is null without an Android app or fingerprints", () => {
        expect(assetLinks(testConfig({ androidPackage: "" }))).toBeNull();
        expect(assetLinks(testConfig({ androidSha256: "" }))).toBeNull();
    });
});

describe("appleAppSiteAssociation", () => {
    it("claims short links but not admin, api or asset paths", () => {
        const aasa = appleAppSiteAssociation(testConfig()) as {
            applinks: { details: Array<{ appID: string; appIDs: string[]; paths: string[]; components: unknown[] }> };
            webcredentials: { apps: string[] };
        };
        const detail = aasa.applinks.details[0];
        expect(detail.appID).toBe("ABCDE12345.com.acme.app");
        expect(detail.appIDs).toEqual(["ABCDE12345.com.acme.app"]);
        expect(detail.paths).toContain("NOT /admin/*");
        expect(detail.paths[detail.paths.length - 1]).toBe("*");
        expect(detail.components).toContainEqual({ "/": "/api/*", "exclude": true });
        expect(aasa.webcredentials.apps).toEqual(["ABCDE12345.com.acme.app"]);
    });

    it("is null without a team ID", () => {
        expect(appleAppSiteAssociation(testConfig({ iosTeamId: "" }))).toBeNull();
    });
});
