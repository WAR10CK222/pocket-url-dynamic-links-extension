import { randomInt } from "crypto";
import { isReservedSlug } from "./schema";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Random base62 slug. 7 characters gives ~3.5 trillion combinations. */
export function generateSlug(length = 7): string {
    let slug = "";
    while (slug === "" || isReservedSlug(slug)) {
        slug = "";
        for (let i = 0; i < length; i++) {
            slug += ALPHABET[randomInt(ALPHABET.length)];
        }
    }
    return slug;
}
