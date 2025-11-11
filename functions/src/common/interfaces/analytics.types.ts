interface IGeoLocation {
    country: object;
    city: object;
    region: object;
}

interface IAnalyticData {
    value: string;
    clickCount: object;
}

interface IUTMData {
    utmParams: {
        utm_source: string;
        utm_medium: string;
        utm_campaign: string;
    };
    clickCount: object;
}

export default interface IAnalytics {
    totalClicks: object;
    referrers: Record<string, IAnalyticData>;
    devices: Record<string, IAnalyticData>;
    os: Record<string, IAnalyticData>;
    browsers: Record<string, IAnalyticData>;
    geolocations: IGeoLocation;
    updateTimestamp: string;
    utmData: Record<string, IUTMData>;
}
