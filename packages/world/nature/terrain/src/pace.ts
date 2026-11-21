/** Thrown when a newer generate run replaced this one. */
export class Cancelled extends Error { constructor() { super("terrain generation cancelled"); } }

/**
 * Cooperative pacing: `await pace.tick()` in hot loops gives the page a frame every ~12 ms,
 * reports progress and stops when `cancelled()` turns true.
 */
export class Pace {
    private last = now();
    stage = "";
    constructor(private onProgress?: (stage: string, done: number) => void, private cancelled: () => boolean = () => false) { }

    begin(stage: string) { this.stage = stage; this.onProgress?.(stage, 0); }

    /** `done` 0..1 of the current stage; resolves at once unless the slice is used up */
    async tick(done: number) {
        if (now() - this.last < 12) return;
        this.onProgress?.(this.stage, done);
        await new Promise(r => setTimeout(r, 0));
        if (this.cancelled()) throw new Cancelled();
        this.last = now();
    }
}

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
