/**
 * Reversible encoding for Realtime Database keys. Keys can't contain `.`, `#`, `$`,
 * `/`, `[`, `]` or control characters; those (and `%` itself) are percent-encoded
 * so labels like "www.instagram.com" round-trip instead of becoming
 * "www_instagram_com" as they did in 0.0.x.
 */
const RESERVED = new Set([".", "#", "$", "/", "[", "]", "%"]);

const hex = (char: string) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;

export function encodeKey(value: string): string {
    let out = "";
    for (const char of value) {
        const code = char.charCodeAt(0);
        out += RESERVED.has(char) || code < 32 || code === 127 ? hex(char) : char;
    }
    return out;
}

export function decodeKey(key: string): string {
    return key.replace(/%([0-9A-F]{2})/g, (match, code: string) => {
        const char = String.fromCharCode(parseInt(code, 16));
        return RESERVED.has(char) || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? char : match;
    });
}
