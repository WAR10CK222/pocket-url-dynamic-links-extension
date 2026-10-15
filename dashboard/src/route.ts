import { useEffect, useState } from "react";

export type Route =
    | { page: "overview" }
    | { page: "links" }
    | { page: "link"; slug: string }
    | { page: "ops" }
    | { page: "setup" };

function parse(hash: string): Route {
    const path = hash.replace(/^#\/?/, "");
    const [first, second] = path.split("/");
    if (first === "links" && second) return { page: "link", slug: decodeURIComponent(second) };
    if (first === "links") return { page: "links" };
    if (first === "ops") return { page: "ops" };
    if (first === "setup") return { page: "setup" };
    return { page: "overview" };
}

export function href(route: Route): string {
    switch (route.page) {
        case "overview":
            return "#/";
        case "link":
            return `#/links/${encodeURIComponent(route.slug)}`;
        default:
            return `#/${route.page}`;
    }
}

/** Hash routing keeps the SPA working behind a single Hosting rewrite with no server config. */
export function useRoute(): Route {
    const [route, setRoute] = useState<Route>(() => parse(location.hash));
    useEffect(() => {
        const onChange = () => {
            setRoute(parse(location.hash));
            window.scrollTo(0, 0);
        };
        window.addEventListener("hashchange", onChange);
        return () => window.removeEventListener("hashchange", onChange);
    }, []);
    return route;
}
