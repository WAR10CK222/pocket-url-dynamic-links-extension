import { onTaskDispatched } from "firebase-functions/tasks";
import { ProvisionInput, runProvision } from "./run";

/**
 * Lifecycle task: runs after the first deploy and after every redeploy
 * (`afterFirstDeploy` / `afterRedeploy` in index.ts), or on demand from the
 * dashboard. Rerun manually with:
 *   firebase functions:lifecycle:run afterRedeploy <kit-instance-id>
 */
export const provision = onTaskDispatched<ProvisionInput>(
    {
        retryConfig: { maxAttempts: 5, minBackoffSeconds: 60, maxBackoffSeconds: 600 },
        rateLimits: { maxConcurrentDispatches: 1 },
        timeoutSeconds: 1800,
        memory: "1GiB",
    },
    async (request) => {
        await runProvision(request.data ?? {});
    },
);
