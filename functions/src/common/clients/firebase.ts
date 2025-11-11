import admin, { ServiceAccount } from "firebase-admin";
import { getFunctions } from "firebase-admin/functions";

if (admin.apps.length !== 1) {
    admin.initializeApp({
        // databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

export const database = admin.database();
export const firebaseFunctions = getFunctions();
export { admin };
