import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The dashboard is served by Hosting at /admin/. For local development against
 * the emulators, set VITE_API_PROXY to the functions emulator URL of the api
 * function, e.g. http://127.0.0.1:5001/demo-pocket-url/us-central1/api
 */
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    return {
        base: "/admin/",
        plugins: [react()],
        build: {
            outDir: "../lib/dashboard",
            emptyOutDir: true,
            sourcemap: false,
            rollupOptions: {
                output: {
                    // Vendor chunks change rarely, so they stay cached across kit releases.
                    manualChunks: {
                        firebase: ["firebase/app", "firebase/auth"],
                        charts: ["chart.js", "react-chartjs-2"],
                        react: ["react", "react-dom"],
                    },
                },
            },
        },
        server: env.VITE_API_PROXY ? {
            proxy: { "/api": { target: env.VITE_API_PROXY, changeOrigin: true } },
        } : undefined,
    };
});
