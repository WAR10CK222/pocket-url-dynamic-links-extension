export interface RunTarget {
    serviceId: string;
    region: string;
}

/**
 * Hosting serving config (REST shape, not firebase.json). Hosting checks static
 * files first, then these rewrites in order: the admin API, the dashboard SPA,
 * and finally every other path goes to the redirect function.
 */
export function buildServingConfig(targets: { api: RunTarget; redirect: RunTarget }) {
    return {
        // We upload our own association files generated from params.
        appAssociation: "NONE",
        headers: [
            {
                glob: "/.well-known/apple-app-site-association",
                headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
            },
            { glob: "/.well-known/assetlinks.json", headers: { "Cache-Control": "public, max-age=3600" } },
            { glob: "/admin/assets/**", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
            { glob: "/admin/@(index.html|config.json)", headers: { "Cache-Control": "no-cache" } },
            { glob: "/images/**", headers: { "Cache-Control": "public, max-age=604800" } },
        ],
        rewrites: [
            { glob: "/api/**", run: { serviceId: targets.api.serviceId, region: targets.api.region } },
            { glob: "/admin", path: "/admin/index.html" },
            { glob: "/admin/**", path: "/admin/index.html" },
            { glob: "**", run: { serviceId: targets.redirect.serviceId, region: targets.redirect.region } },
        ],
    };
}
