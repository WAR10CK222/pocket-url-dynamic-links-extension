import { getFunctions } from "firebase-admin/functions";
import { adminApp } from "../common/clients/firebase";
import { ProvisioningState } from "./run";

/**
 * Enqueues the provision task (the dashboard's "Re-run provisioning" button).
 * When installed as a kit, firebase-admin adds the `kit-<instance>-` prefix
 * itself, so the unprefixed name is used.
 */
export async function enqueueProvision(state: Partial<ProvisioningState>, requestedBy: string): Promise<void> {
    const region = state.services?.provision?.region || state.region || "us-central1";
    const name = process.env.FIREBASE_KIT_INSTANCE_ID ? "provision" : (state.services?.provision?.id ?? "provision");
    await getFunctions(adminApp())
        .taskQueue(`locations/${region}/functions/${name}`)
        .enqueue({ reason: "manual", requestedBy });
}
