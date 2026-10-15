import { ServerValue } from "firebase-admin/database";
import { logger } from "firebase-functions";
import { projectId } from "../common/clients/firebase";
import { packageVersion } from "../common/paths";
import { getConfig } from "../config";
import { context } from "../context";
import { migrateLegacyLayout } from "../data/migrateLegacy";
import { rel } from "../data/paths";
import { ensureAuthorizedDomains } from "./authDomains";
import { deployVersion } from "./deploy";
import { buildSiteFiles, deployFingerprint } from "./files";
import { statusOf } from "./gcp";
import { buildServingConfig } from "./hostingConfig";
import { HostingClient, normalizeVersionName, Site, summarizeCustomDomain } from "./hostingClient";
import { ensureDefaultDatabase } from "./rtdbInstance";
import { DeployedFunction, HOSTING_REWRITE_REGIONS, listFunctions, resolveKitFunctions } from "./serviceIds";

/** An error retrying won't fix (bad config). The task records it and stops. */
export class FatalProvisionError extends Error {}

export interface ProvisionInput {
    reason?: string;
    requestedBy?: string;
}

export interface ProvisioningState {
    state: "running" | "ready" | "failed";
    step: string;
    reason?: string;
    version?: string;
    error?: string | null;
    fatal?: boolean;
    warnings?: string[];
    siteId?: string;
    siteUrl?: string;
    shortDomain?: string;
    dashboardUrl?: string;
    region?: string;
    services?: Record<string, Pick<DeployedFunction, "id" | "serviceId" | "region">>;
    lastDeployHash?: string;
    lastVersionName?: string | null;
    skippedDeploy?: boolean;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Nothing changed since the last deploy, and the live release is still ours. */
export function shouldSkipDeploy(
    previous: Partial<ProvisioningState>,
    fingerprint: string,
    liveVersionName: string | null,
): boolean {
    const last = normalizeVersionName(previous.lastVersionName);
    return Boolean(previous.lastDeployHash === fingerprint && last && last === normalizeVersionName(liveVersionName));
}

const MANAGED_LABEL = "managed-by";
const MANAGED_VALUE = "pocket-url";

async function ensureSite(hosting: HostingClient, project: string, siteId: string, instanceId: string): Promise<Site> {
    if (siteId === project) {
        throw new FatalProvisionError(
            `HOSTING_SITE_ID "${siteId}" is your project's default Hosting site. Pocket URL needs a dedicated site ` +
            "so it never replaces your app's content. Choose another ID and redeploy.");
    }
    const labels: Record<string, string> = { [MANAGED_LABEL]: MANAGED_VALUE };
    if (instanceId) labels["kit-instance"] = instanceId.replace(/[^a-z0-9_-]/g, "-").slice(0, 63);

    const existing = await hosting.getSite(siteId);
    if (existing) {
        if (existing.type === "DEFAULT_SITE") {
            throw new FatalProvisionError(`"${siteId}" is a default Hosting site. Choose a different HOSTING_SITE_ID.`);
        }
        if (existing.labels?.[MANAGED_LABEL] === MANAGED_VALUE) return existing;
        if (await hosting.latestRelease(siteId)) {
            throw new FatalProvisionError(
                `The Hosting site "${siteId}" already serves content that Pocket URL didn't deploy. Choose a different ` +
                `HOSTING_SITE_ID, or add the label ${MANAGED_LABEL}=${MANAGED_VALUE} to that site to let Pocket URL take it over.`);
        }
        return hosting.updateSiteLabels(siteId, { ...(existing.labels ?? {}), ...labels });
    }
    try {
        return await hosting.createSite(siteId, labels);
    } catch (error) {
        if ([400, 409].includes(statusOf(error))) {
            throw new FatalProvisionError(
                `Couldn't create Hosting site "${siteId}": ${errorMessage(error)}. Site IDs are global across Firebase, ` +
                "so it may belong to another project. Choose a different HOSTING_SITE_ID and redeploy.");
        }
        if (statusOf(error) === 403) {
            throw new Error(`Permission denied creating the Hosting site. Roles granted during deploy can take a few minutes to apply; this task will retry. (${errorMessage(error)})`);
        }
        throw error;
    }
}

/**
 * Provisions everything outside Cloud Functions: the database layout, the Hosting
 * site (dashboard, static assets, association files, rewrites), Auth authorized
 * domains and the custom domain. Idempotent; runs after every deploy.
 */
export async function runProvision(input: ProvisionInput = {}): Promise<ProvisioningState> {
    const config = getConfig();
    const project = projectId();
    const instanceId = process.env.FIREBASE_KIT_INSTANCE_ID ?? "";
    const version = packageVersion();
    const reason = input.reason ?? "manual";
    const warnings: string[] = [];
    const log = (message: string, data: Record<string, unknown> = {}) =>
        logger.info(`Pocket URL provisioning: ${message}`, { instanceId, ...data });

    // The database comes first: status is recorded there.
    if (!config.rtdbUrl) {
        try {
            const database = await ensureDefaultDatabase(project);
            if (database.created) log("Created the default Realtime Database instance", { url: database.url });
        } catch (error) {
            warnings.push(`Couldn't verify the default Realtime Database instance (${errorMessage(error)}). ` +
                "If the project has none, create one in the Firebase console and rerun provisioning.");
        }
    }

    const { db } = context();
    const root = db.ref(config.databasePath);
    const statusRef = root.child(rel.provisioning);
    const previous = ((await statusRef.get()).val() ?? {}) as Partial<ProvisioningState>;
    const setStep = async (step: string) => {
        log(step);
        await statusRef.update({ state: "running", step, updatedAt: ServerValue.TIMESTAMP });
    };

    try {
        await statusRef.update({
            state: "running",
            step: "starting",
            reason,
            version,
            requestedBy: input.requestedBy ?? null,
            error: null,
            fatal: null,
            startedAt: ServerValue.TIMESTAMP,
            updatedAt: ServerValue.TIMESTAMP,
        });

        await setStep("migrating-data");
        const migration = await migrateLegacyLayout(db, config.databasePath, {
            retentionDays: config.clickRetentionDays,
            log,
        });

        await setStep("resolving-functions");
        const fns = resolveKitFunctions(await listFunctions(project), process.env.K_SERVICE, instanceId || undefined);
        if (!fns.redirect || !fns.api) {
            throw new Error(`Couldn't find the deployed functions ${fns.prefix}redirect and ${fns.prefix}api yet; will retry.`);
        }
        for (const fn of [fns.redirect, fns.api]) {
            if (!HOSTING_REWRITE_REGIONS.has(fn.region)) {
                throw new FatalProvisionError(
                    `Function ${fn.id} is deployed in ${fn.region}, where Firebase Hosting can't route to Cloud Run. ` +
                    "Set FUNCTION_DEFAULT_REGION to a supported region (for example us-central1) and redeploy.");
            }
        }

        await setStep("preparing-site");
        const hosting = new HostingClient(project);
        const siteId = config.hostingSiteId;
        await ensureSite(hosting, project, siteId, instanceId);
        try {
            await hosting.updateSiteConfig(siteId, 10);
        } catch (error) {
            warnings.push(`Couldn't limit stored Hosting versions to 10 (${errorMessage(error)}).`);
        }

        await setStep("deploying-site");
        const { files, dashboardIncluded } = buildSiteFiles({ config, projectId: project, instanceId, version });
        if (!dashboardIncluded) warnings.push("The dashboard build wasn't found in the package, so /admin won't load.");
        const servingConfig = buildServingConfig({ api: fns.api, redirect: fns.redirect });
        const fingerprint = deployFingerprint(servingConfig, files);
        const live = await hosting.latestRelease(siteId);
        let versionName = normalizeVersionName(live?.version?.name);
        const skippedDeploy = shouldSkipDeploy(previous, fingerprint, versionName);
        if (skippedDeploy) {
            log("Hosting is up to date; skipping deploy");
        } else {
            const deployed = await deployVersion(hosting, siteId, servingConfig, files, `Pocket URL ${version} (${reason})`);
            versionName = normalizeVersionName(deployed.versionName);
            log("Released a new Hosting version", { versionName, files: files.length, uploaded: deployed.uploaded });
        }

        const domains = [`${siteId}.web.app`, `${siteId}.firebaseapp.com`, config.customDomain].filter(Boolean);
        if (config.autoAuthorizeDomains) {
            await setStep("authorizing-domains");
            try {
                const { added } = await ensureAuthorizedDomains(project, domains);
                if (added.length) log("Added Firebase Auth authorized domains", { added });
            } catch (error) {
                warnings.push(`Couldn't add Firebase Auth authorized domains (${errorMessage(error)}). Add ${domains.join(", ")} ` +
                    "under Authentication → Settings → Authorized domains.");
            }
        }

        if (config.customDomain) {
            await setStep("connecting-domain");
            try {
                let resource = await hosting.getCustomDomain(siteId, config.customDomain);
                if (!resource) {
                    await hosting.createCustomDomain(siteId, config.customDomain);
                    resource = await hosting.getCustomDomain(siteId, config.customDomain);
                }
                await root.child(rel.domain).set({
                    ...summarizeCustomDomain(config.customDomain, resource),
                    updatedAt: ServerValue.TIMESTAMP,
                });
            } catch (error) {
                warnings.push(`Couldn't connect ${config.customDomain} (${errorMessage(error)}). ` +
                    "You can add it manually in the Firebase console under Hosting.");
            }
        } else {
            await root.child(rel.domain).remove();
        }

        const siteUrl = `https://${siteId}.web.app`;
        const toSummary = (fn: DeployedFunction) => ({ id: fn.id, serviceId: fn.serviceId, region: fn.region });
        const result: ProvisioningState = {
            state: "ready",
            step: "done",
            error: null,
            fatal: false,
            warnings,
            siteId,
            siteUrl,
            shortDomain: config.shortDomain,
            dashboardUrl: `${siteUrl}/admin`,
            region: fns.region,
            services: {
                redirect: toSummary(fns.redirect),
                api: toSummary(fns.api),
                ...(fns.provision ? { provision: toSummary(fns.provision) } : {}),
            },
            lastDeployHash: fingerprint,
            lastVersionName: versionName,
            skippedDeploy,
        };
        await statusRef.update({
            ...result,
            migration: { skipped: migration.skipped, migratedLinks: migration.migratedLinks },
            finishedAt: ServerValue.TIMESTAMP,
            updatedAt: ServerValue.TIMESTAMP,
        });
        log("Ready", { siteUrl, dashboardUrl: result.dashboardUrl, warnings });
        return result;
    } catch (error) {
        const fatal = error instanceof FatalProvisionError;
        await statusRef.update({
            state: "failed",
            error: errorMessage(error),
            fatal,
            warnings,
            finishedAt: ServerValue.TIMESTAMP,
            updatedAt: ServerValue.TIMESTAMP,
        });
        logger.error("Pocket URL provisioning failed", { instanceId, error: errorMessage(error), fatal });
        // Fatal errors need a config change, so don't burn retries on them.
        if (fatal) return { state: "failed", step: "failed", error: errorMessage(error), fatal, warnings };
        throw error;
    }
}
