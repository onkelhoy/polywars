/**
 * A damped spring per axis, pulled to `target`: `stiffness` (1/s², higher = quicker), `damping` (1/s).
 * Critically damped at damping = 2·sqrt(stiffness). `kick` adds velocity.
 */
export class Spring {
    readonly value: number[];
    readonly velocity: number[];
    readonly target: number[];

    constructor(size: number, public stiffness = 120, public damping = 14) {
        this.value = new Array(size).fill(0);
        this.velocity = new Array(size).fill(0);
        this.target = new Array(size).fill(0);
    }

    kick(...v: number[]) {
        v.forEach((x, i) => { this.velocity[i] += x; });
    }

    update(dt: number) {
        // small fixed steps: stable for stiff springs on slow frames
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / n;
        for (let s = 0; s < n; s++)
            for (let i = 0; i < this.value.length; i++)
            {
                const a = (this.target[i] - this.value[i]) * this.stiffness - this.velocity[i] * this.damping;
                this.velocity[i] += a * h;
                this.value[i] += this.velocity[i] * h;
            }
    }
}
