/**
 * Pocket URL function kit.
 *
 * Exports four functions (deployed as kit-<instance>-<name> when installed as a kit):
 *   redirect   public short-link resolver
 *   api        admin REST API used by the dashboard
 *   provision  lifecycle task that creates and deploys the Hosting site
 *   prune      daily click-log retention
 */
import { requiresAPI, requiresRole } from "firebase-functions";
import { afterFirstDeploy, afterRedeploy } from "firebase-functions/lifecycle";
import { assertRequiredParams } from "./params";

assertRequiredParams();

// Declarative security: the Firebase CLI grants these roles to the instance's
// managed service account and enables these APIs at deploy time.
requiresRole("roles/firebasedatabase.admin");
requiresRole("roles/firebasehosting.admin");
requiresRole("roles/cloudfunctions.viewer");
requiresRole("roles/run.viewer");
requiresRole("roles/cloudtasks.enqueuer");
requiresRole("roles/run.invoker");
// verifyIdToken(token, true) reads the user record to check for revoked sessions.
requiresRole("roles/firebaseauth.viewer");
requiresAPI("firebasehosting.googleapis.com", "Creates and deploys the Hosting site that serves short links and the dashboard.");
requiresAPI("firebasedatabase.googleapis.com", "Stores links and analytics in the Realtime Database.");
requiresAPI("cloudfunctions.googleapis.com", "Looks up this kit's deployed functions to route Hosting traffic to them.");
requiresAPI("run.googleapis.com", "Routes Hosting traffic to the functions' Cloud Run services.");
requiresAPI("cloudtasks.googleapis.com", "Runs provisioning after deploys and on demand.");
requiresAPI("cloudscheduler.googleapis.com", "Runs the daily click-log cleanup.");
if (process.env.AUTO_AUTHORIZE_DOMAINS !== "false") {
    requiresRole("roles/firebaseauth.admin");
    requiresAPI("identitytoolkit.googleapis.com", "Adds the dashboard's domains to Firebase Auth authorized domains.");
}

// Provision after every deploy. The task body must be wrapped in `data`.
afterFirstDeploy({ task: { function: "provision", body: { data: { reason: "first-deploy" } } } });
afterRedeploy({ task: { function: "provision", body: { data: { reason: "redeploy" } } } });

export { redirect } from "./redirect";
export { api } from "./api";
export { provision } from "./provision";
export { prune } from "./maintenance/prune";
