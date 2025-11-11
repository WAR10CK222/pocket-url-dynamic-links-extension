import IConfig from "@/common/interfaces/config.types";

const config: IConfig = {
    hostname: process.env.HOSTNAME as string,
    sitename: process.env.SITENAME as string,
    siteurl: process.env.SITEURL as string,
    siteicon: process.env.SITEICON as string,
    sitekeywords: process.env.SITEKEYWORDS as string,
    dynamiclinkdomain: process.env.DYNAMICLINKDOMAIN as string,
    twitterhandle: process.env.TWITTERHANDLE as string,
    iosBundleID: process.env.IOSBUNDLEID as string,
    iosTeamID: process.env.IOSTEAMID as string,
    iosItunesID: process.env.IOSITUNESID as string,
    androidBundleID: process.env.ANDROIDBUNDLEID as string,
    androidSHA: process.env.ANDROIDSHA as string,
    androidScheme: process.env.ANDROIDSCHEME as string,
};

export default config;
