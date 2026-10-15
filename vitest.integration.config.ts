import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        include: ["test/integration/**/*.test.ts"],
        environment: "node",
        testTimeout: 20000,
        hookTimeout: 30000,
        fileParallelism: false,
        setupFiles: ["test/integration/setup.ts"],
    },
});
