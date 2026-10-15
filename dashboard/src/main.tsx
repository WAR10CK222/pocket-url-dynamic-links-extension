import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initRuntime } from "./firebase";
import { applyThemeChoice, readThemeChoice } from "./theme";
import "./styles.css";

applyThemeChoice(readThemeChoice());
const root = createRoot(document.getElementById("root") as HTMLElement);

initRuntime()
    .then((runtime) => root.render(<StrictMode><App runtime={runtime} /></StrictMode>))
    .catch((error: unknown) => root.render(
        <div className="signin">
            <div className="card">
                <h1>Dashboard unavailable</h1>
                <div className="notice critical">{error instanceof Error ? error.message : String(error)}</div>
            </div>
        </div>,
    ));
