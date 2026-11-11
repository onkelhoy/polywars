import type { PingOptions, PingStat, PingTarget } from "./types";

/**
 * Measures the round trip to every other player with a ping / pong message pair, every `every` ms.
 * Each player answers pings by itself as soon as it runs a `Ping`, so start one on every peer.
 */
export class Ping {
    private stats = new Map<string, PingStat & { samples: number[]; sent: Map<number, number> }>();
    private n = 0;
    private timer: ReturnType<typeof setInterval> | undefined;
    private off: (() => void)[] = [];
    private listeners = new Set<(stats: PingStat[]) => void>();
    private o: Required<PingOptions>;

    constructor(private target: PingTarget, options: PingOptions = {}) {
        this.o = { every: 2000, weak: 250, samples: 5, timeout: 5000, type: "ping", ...options };
        const ping = `${this.o.type}:ping`, pong = `${this.o.type}:pong`;

        this.off.push(target.onMessage(ping, (data, from) => target.send(from, pong, data)));
        this.off.push(target.onMessage(pong, (data, from) => this.pong(from, data?.n)));
        this.timer = setInterval(() => this.round(), this.o.every);
        this.round();
    }

    /** Every other player, by id. */
    get all(): PingStat[] {
        return [...this.stats.values()].map(({ samples, sent, ...stat }) => stat);
    }

    of(id: string): PingStat | null {
        const stat = this.stats.get(id);
        if (!stat) return null;
        const { samples, sent, ...rest } = stat;
        return rest;
    }

    /** Called after every round and pong. Returns the unsubscribe. */
    onChange(listener: (stats: PingStat[]) => void) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    stop() {
        clearInterval(this.timer);
        this.off.forEach(off => off());
        this.off = [];
        this.listeners.clear();
    }

    private round() {
        const now = performance.now();
        const ids = new Set(this.target.players.map(p => p.id).filter(id => id !== this.target.me));
        for (const id of this.stats.keys()) if (!ids.has(id)) this.stats.delete(id);

        for (const id of ids)
        {
            let stat = this.stats.get(id);
            if (!stat) this.stats.set(id, stat = { id, rtt: null, last: null, weak: false, lost: 0, samples: [], sent: new Map() });
            for (const [n, at] of stat.sent) if (now - at > this.o.timeout)
            {
                stat.sent.delete(n);
                stat.lost++;
                stat.weak = true;
            }
            const n = this.n++;
            stat.sent.set(n, now);
            this.target.send(id, `${this.o.type}:ping`, { n });
        }
        this.changed();
    }

    private pong(from: string, n: unknown) {
        const stat = this.stats.get(from);
        const at = typeof n === "number" ? stat?.sent.get(n) : undefined;
        if (!stat || at === undefined) return;
        stat.sent.delete(n as number);
        stat.last = Math.round(performance.now() - at);
        stat.samples.push(stat.last);
        if (stat.samples.length > this.o.samples) stat.samples.shift();
        stat.rtt = Math.round(stat.samples.reduce((a, b) => a + b, 0) / stat.samples.length);
        stat.lost = 0;
        stat.weak = stat.rtt > this.o.weak;
        this.changed();
    }

    private changed() {
        const all = this.all;
        this.listeners.forEach(listener => listener(all));
    }
}
