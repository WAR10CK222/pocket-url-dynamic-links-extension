import { createContext, DependencyList, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Api } from "./api";
import { RuntimeConfig } from "./types";

export interface AppContextValue {
    api: Api;
    config: RuntimeConfig;
    toast: (message: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
    const value = useContext(AppContext);
    if (!value) throw new Error("AppContext missing");
    return value;
}

/**
 * Loads data and keeps the previous result on screen while refetching, so
 * charts dim instead of flashing a skeleton.
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);
    const sequence = useRef(0);
    // `deps` stands in for `load`'s inputs, as with useEffect.
    const run = useCallback(load, deps);

    const reload = useCallback(async () => {
        const id = ++sequence.current;
        setLoading(true);
        try {
            const result = await run();
            if (id === sequence.current) {
                setData(result);
                setError(null);
            }
        } catch (err) {
            if (id === sequence.current) setError(err);
        } finally {
            if (id === sequence.current) setLoading(false);
        }
    }, [run]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { data, error, loading, reload, setData };
}
