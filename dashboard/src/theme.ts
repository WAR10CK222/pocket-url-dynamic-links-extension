import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "pocket-url-theme";

export function readThemeChoice(): ThemeChoice {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === "light" || stored === "dark" ? stored : "system";
    } catch {
        return "system";
    }
}

export function applyThemeChoice(choice: ThemeChoice): void {
    if (choice === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    try {
        if (choice === "system") localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
        // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
    window.dispatchEvent(new Event("pocket-url-theme"));
}

/** Chart colors resolved from the CSS custom properties of the active theme. */
export interface ChartTheme {
    series1: string;
    series2: string;
    deemphasis: string;
    text: string;
    muted: string;
    grid: string;
    axis: string;
    surface: string;
}

function readChartTheme(): ChartTheme {
    const style = getComputedStyle(document.documentElement);
    const v = (name: string) => style.getPropertyValue(name).trim();
    return {
        series1: v("--series-1"),
        series2: v("--series-2"),
        deemphasis: v("--deemphasis"),
        text: v("--text-secondary"),
        muted: v("--text-muted"),
        grid: v("--grid"),
        axis: v("--axis"),
        surface: v("--surface-1"),
    };
}

/** Re-reads chart colors when the OS theme or the in-app toggle changes. */
export function useChartTheme(): ChartTheme {
    const [theme, setTheme] = useState<ChartTheme>(readChartTheme);
    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const update = () => setTheme(readChartTheme());
        media.addEventListener("change", update);
        window.addEventListener("pocket-url-theme", update);
        return () => {
            media.removeEventListener("change", update);
            window.removeEventListener("pocket-url-theme", update);
        };
    }, []);
    return theme;
}
