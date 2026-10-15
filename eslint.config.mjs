import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["lib/**", "functions/**", "dashboard/**", "example/**/lib/**", "coverage/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: { ...globals.node },
        },
        rules: {
            "indent": ["error", 4, { SwitchCase: 1 }],
            "quotes": ["warn", "double", { avoidEscape: true }],
            "semi": ["warn", "always"],
            "object-curly-spacing": ["warn", "always"],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["**/*.cjs"],
        languageOptions: { sourceType: "commonjs" },
        rules: { "@typescript-eslint/no-require-imports": "off" },
    },
    {
        files: ["test/**/*.ts"],
        rules: { "@typescript-eslint/no-explicit-any": "off" },
    },
);
