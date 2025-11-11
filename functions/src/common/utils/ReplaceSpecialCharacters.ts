/**
 * Replaces special characters in a string with underscores.
 *
 * This function replaces any occurrence of the following characters: `.`, `#`, `$`, `/`, `[`, or `]`
 * with an underscore (`_`). This is useful for sanitizing strings for use in contexts
 * where these characters are not allowed (e.g., Firebase keys).
 *
 * @param {string} str - The input string to sanitize.
 * @return {string} The sanitized string with special characters replaced by underscores.
 */
export default (str: string): string => {
    return str.replace(/[.#$\/\[\]]/g, "_");
};
