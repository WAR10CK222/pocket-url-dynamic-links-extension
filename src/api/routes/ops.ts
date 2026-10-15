import { Request, Response, Router } from "express";
import { projectId } from "../../common/clients/firebase";
import { resolveRange } from "../../common/dates";
import { EHttpStatusCode } from "../../common/interfaces/commonbackend.types";
import { context } from "../../context";
import { rel } from "../../data/paths";
import { enqueueProvision } from "../../provision/enqueue";
import { HostingClient, summarizeCustomDomain } from "../../provision/hostingClient";
import { ProvisioningState } from "../../provision/run";
import { currentUser } from "../auth";
import { apiError, ok } from "../http";
import { opsFromDaily } from "../summaries";

/** Deep links into the Cloud and Firebase consoles for this instance's resources. */
export function consoleLinks(project: string, state: Partial<ProvisioningState>) {
    const services = Object.values(state.services ?? {});
    const serviceFilter = services.map((service) => `"${service.serviceId}"`).join(" OR ");
    const logQuery = [
        "resource.type=\"cloud_run_revision\"",
        serviceFilter ? `resource.labels.service_name=(${serviceFilter})` : "",
        "severity>=WARNING",
    ].filter(Boolean).join("\n");
    const redirect = state.services?.redirect;
    return {
        logs: `https://console.cloud.google.com/logs/query;query=${encodeURIComponent(logQuery)}?project=${project}`,
        redirectMetrics: redirect ?
            `https://console.cloud.google.com/run/detail/${redirect.region}/${redirect.serviceId}/metrics?project=${project}` : null,
        functions: `https://console.firebase.google.com/project/${project}/functions`,
        hosting: state.siteId ? `https://console.firebase.google.com/project/${project}/hosting/sites/${state.siteId}` : null,
        authProviders: `https://console.firebase.google.com/project/${project}/authentication/providers`,
        authSettings: `https://console.firebase.google.com/project/${project}/authentication/settings`,
        database: `https://console.firebase.google.com/project/${project}/database`,
    };
}

export function opsRouter(): Router {
    const router = Router();

    router.get("/", async (req: Request, res: Response) => {
        const { analytics, links, config, db } = context();
        const range = resolveRange(req.query.from, req.query.to, 14);
        const root = db.ref(config.databasePath);
        const [daily, provisioningSnap, domainSnap] = await Promise.all([
            analytics.getDailyOps(range.from, range.to),
            root.child(rel.provisioning).get(),
            root.child(rel.domain).get(),
        ]);
        const provisioning = (provisioningSnap.val() ?? {}) as Partial<ProvisioningState>;
        const summary = opsFromDaily(range.from, range.to, daily);

        // Flag missing slugs that now exist (created after the misses happened).
        const topNotFound = await Promise.all(summary.topNotFound.map(async (entry) => ({
            ...entry,
            exists: Boolean(await links.get(entry.key)),
        })));

        let domain = domainSnap.val();
        if (config.customDomain && req.query.live !== "0") {
            try {
                const hosting = new HostingClient(projectId());
                domain = summarizeCustomDomain(config.customDomain, await hosting.getCustomDomain(config.hostingSiteId, config.customDomain));
            } catch {
                // Fall back to the status recorded by the last provisioning run.
            }
        }

        ok(req, res, {
            range,
            ...summary,
            topNotFound,
            provisioning,
            domain,
            setup: {
                iosConfigured: Boolean(config.ios?.teamId),
                androidConfigured: Boolean(config.android?.sha256Fingerprints.length),
                customDomain: config.customDomain || null,
                shortDomain: config.shortDomain,
                autoAuthorizeDomains: config.autoAuthorizeDomains,
            },
            consoleLinks: consoleLinks(projectId(), provisioning),
        });
    });

    router.post("/provision", async (req: Request, res: Response) => {
        const { config, db } = context();
        const state = ((await db.ref(config.databasePath).child(rel.provisioning).get()).val() ?? {}) as Partial<ProvisioningState>;
        if (state.state === "running") {
            throw apiError(EHttpStatusCode.CONFLICT, "Provisioning is already running");
        }
        await enqueueProvision(state, currentUser(res).email ?? currentUser(res).uid);
        ok(req, res, { queued: true }, 202);
    });

    return router;
}
