/**
 * Local development server: `npm run serve` (reads params from .env).
 * Never imported by the deployed functions.
 */
import { createRedirectApp } from "./app";

if (require.main === module) {
    const port = Number(process.env.PORT ?? 3000);
    createRedirectApp().listen(port, () => {
        console.log(`Pocket URL redirect server listening on http://localhost:${port}`);
    });
}
