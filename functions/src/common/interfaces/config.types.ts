export default interface IConfig {
    // Required Information
    hostname: string;
    sitename: string;
    siteurl: string;
    siteicon: string;
    // sitefavicon: string;
    sitekeywords: string;

    // Custom Domain
    dynamiclinkdomain?: string;

    // Twitter Handler
    twitterhandle?: string;

    // iOS Application
    iosBundleID?: string;
    iosTeamID?: string;
    iosItunesID?: string;

    // Android Application
    androidBundleID?: string;
    androidSHA?: string;
    androidScheme?: string;
}
