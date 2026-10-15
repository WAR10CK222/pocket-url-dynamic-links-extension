export interface RuntimeConfig {
    projectId: string;
    instanceId: string;
    version: string;
    packageName?: string;
    apiBase: string;
    siteName: string;
    shortDomain: string;
    hostingSiteId: string;
    webApiKey: string;
}

export type LinkStatus = "active" | "disabled" | "expired";

export interface LinkFields {
    redirectUrl: string;
    og?: { title?: string; description?: string; image?: string };
    redirectToStore?: boolean;
    disabled?: boolean;
    expireAt?: number | null;
    preview?: boolean;
    iosFallbackUrl?: string | null;
    androidFallbackUrl?: string | null;
    desktopUrl?: string | null;
    forwardQuery?: boolean;
    tags?: string[];
}

export interface Link extends LinkFields {
    slug: string;
    status: LinkStatus;
    shortUrl: string;
    totalClicks?: number;
    botClicks?: number;
    createdAt?: number;
    createdBy?: string;
    updatedAt?: number;
}

export interface Ranked {
    key: string;
    label: string;
    count: number;
}

export interface Range {
    from: string;
    to: string;
}

export interface Overview {
    range: Range;
    linkCount: number;
    totals: { clicks: number; bots: number; appResolves: number };
    series: Array<{ date: string; clicks: number; bots: number }>;
    topLinks: Ranked[];
    countries: Ranked[];
    referrers: Ranked[];
    devices: Ranked[];
}

export interface LinkStats {
    slug: string;
    range: Range;
    totals: { totalClicks: number; botClicks: number };
    series: Array<{ date: string; clicks: number }>;
    referrers: Ranked[];
    devices: Ranked[];
    os: Ranked[];
    browsers: Ranked[];
    countries: Ranked[];
    regions: Ranked[];
    cities: Ranked[];
    utm: Array<{ source: string; medium: string; campaign: string; count: number }>;
    updatedAt: number | null;
}

export interface Click {
    id: string;
    timestamp: number;
    referrer: string;
    platform: string;
    deviceType: string;
    os: string;
    browser: string;
    country: string;
    city: string;
    region: string;
    source: "web" | "app";
    utmParams?: { utm_source: string; utm_medium: string; utm_campaign: string };
}

export interface DnsRecord {
    domainName: string;
    type: string;
    rdata: string;
    requiredAction: string;
}

export interface DomainStatus {
    domain: string;
    found: boolean;
    hostState: string;
    ownershipState: string;
    certState: string;
    active: boolean;
    reconciling: boolean;
    records: DnsRecord[];
}

export interface Provisioning {
    state?: "running" | "ready" | "failed";
    step?: string;
    reason?: string;
    version?: string;
    error?: string | null;
    fatal?: boolean;
    warnings?: string[];
    siteUrl?: string;
    dashboardUrl?: string;
    shortDomain?: string;
    finishedAt?: number;
    startedAt?: number;
    skippedDeploy?: boolean;
}

export interface Ops {
    range: Range;
    series: Array<{ date: string; errors: number; notFound: number }>;
    topNotFound: Array<Ranked & { exists: boolean }>;
    notFoundOther: number;
    latency: { buckets: Record<string, number>; p50: number | null; p95: number | null };
    provisioning: Provisioning;
    domain: DomainStatus | null;
    setup: {
        iosConfigured: boolean;
        androidConfigured: boolean;
        customDomain: string | null;
        shortDomain: string;
        autoAuthorizeDomains: boolean;
    };
    consoleLinks: Record<string, string | null>;
}
