import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/scheduler";
import { addDays, dateKey, dateKeysBetween, isDateKey } from "../common/dates";
import { context } from "../context";
import { rel } from "../data/paths";

const OPS_RETENTION_DAYS = 400;
const DELETE_BATCH = 100;

/**
 * Deletes raw clicks older than CLICK_RETENTION_DAYS and ops counters older than
 * ~13 months. Data is bucketed by day, so this deletes whole day nodes by path
 * without reading them. Aggregated per-link and daily stats are kept.
 */
export async function runPrune(now = Date.now()): Promise<{ deletedDays: number }> {
    const { db, config } = context();
    const root = db.ref(config.databasePath);
    const today = dateKey(now);
    const prunedThrough = ((await root.child(rel.prunedThrough).get()).val() ?? {}) as Record<string, string>;

    const targets = [
        { key: "clicks", cutoff: addDays(today, -config.clickRetentionDays), path: rel.clicksDay },
        { key: "ops", cutoff: addDays(today, -OPS_RETENTION_DAYS), path: rel.opsDay },
    ];
    const paths: string[] = [];
    const markers: Record<string, string> = {};
    for (const target of targets) {
        const start = isDateKey(prunedThrough[target.key]) ? addDays(prunedThrough[target.key], 1) : addDays(target.cutoff, -730);
        for (const day of dateKeysBetween(start, target.cutoff, 1500)) paths.push(target.path(day));
        markers[`${rel.prunedThrough}/${target.key}`] = target.cutoff;
    }

    for (let i = 0; i < paths.length; i += DELETE_BATCH) {
        await root.update(Object.fromEntries(paths.slice(i, i + DELETE_BATCH).map((path) => [path, null])));
    }
    await root.update(markers);
    logger.info("Pocket URL: pruned old analytics", { deletedDays: paths.length, through: markers });
    return { deletedDays: paths.length };
}

export const prune = onSchedule(
    { schedule: "every day 03:17", timeZone: "Etc/UTC", retryCount: 1, memory: "256MiB", timeoutSeconds: 540 },
    async () => {
        await runPrune();
    },
);
