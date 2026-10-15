interface Entry<V> {
    value: V;
    expiresAt: number;
}

/**
 * Small per-instance TTL cache with in-flight de-duplication, so a burst of
 * concurrent clicks on one link costs a single database read.
 */
export class TtlCache<V> {
    private readonly entries = new Map<string, Entry<V>>();
    private readonly inFlight = new Map<string, Promise<V>>();

    constructor(private readonly maxEntries = 5000, private readonly now: () => number = Date.now) {}

    async get(key: string, ttlMs: (value: V) => number, load: () => Promise<V>): Promise<V> {
        const entry = this.entries.get(key);
        if (entry && entry.expiresAt > this.now()) return entry.value;

        const pending = this.inFlight.get(key);
        if (pending) return pending;

        const promise = load().then((value) => {
            const ttl = ttlMs(value);
            if (ttl > 0) this.set(key, value, ttl);
            return value;
        }).finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, promise);
        return promise;
    }

    set(key: string, value: V, ttlMs: number): void {
        this.entries.delete(key);
        if (this.entries.size >= this.maxEntries) {
            // Maps iterate in insertion order: drop the oldest entry.
            const oldest = this.entries.keys().next().value;
            if (oldest !== undefined) this.entries.delete(oldest);
        }
        this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    }

    delete(key: string): void {
        this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
    }
}
