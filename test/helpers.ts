import { AppConfig, buildConfig } from "../src/config";

export function testConfig(overrides: Partial<Parameters<typeof buildConfig>[0]> = {}): AppConfig {
    return buildConfig({
        hostingSiteId: "acme-links",
        siteName: "Acme",
        siteUrl: "https://acme.com",
        adminEmails: "Admin@Acme.com, ops@acme.com",
        iosBundleId: "com.acme.app",
        iosTeamId: "ABCDE12345",
        iosAppStoreId: "1234567890",
        androidPackage: "com.acme.app",
        androidSha256: "aa:bb, CC:DD",
        twitterHandle: "@acme",
        ...overrides,
    });
}
