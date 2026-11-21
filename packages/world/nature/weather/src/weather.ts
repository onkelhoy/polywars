import { fbm, simplex } from "@polywar/noise";
import type { Climate, CloudKind, WeatherOptions, WeatherSample } from "./types";

const MILD: Climate = () => ({ temperature: .55, moisture: .5 });

/**
 * The humidity field: biome moisture + slow noise blown along by the wind, plus a slow swing over time.
 * Clouds are always "there" (the sky's noise); humidity only decides how much of them shows.
 * Same seed + time = same weather on every client.
 */
export class Weather {
    readonly o: Required<WeatherOptions>;
    /** game seconds */
    time = 0;
    private n: ReturnType<typeof simplex>;
    private swing: ReturnType<typeof simplex>;

    constructor(options: WeatherOptions = {}) {
        this.o = { seed: 1, climate: MILD, wind: [6, 2], scale: 6000, speed: 1, bias: 0, snowBelow: .3, ...options };
        this.n = simplex(this.o.seed);
        this.swing = simplex(this.o.seed + 7);
    }

    update(dt: number) { this.time += dt * this.o.speed; }

    /** how far the field has blown, m (sky shaders scroll their clouds by this) */
    get drift(): [number, number] { return [this.o.wind[0] * this.time, this.o.wind[1] * this.time]; }

    humidity(x: number, z: number) {
        const { scale, bias } = this.o, [dx, dz] = this.drift, c = this.o.climate(x, z);
        const local = fbm(this.n, (x - dx) / scale, (z - dz) / scale, { octaves: 3 });
        const slow = this.swing(this.time / 1800, 3.1) * .25;
        // dry places stay dry: the noise swing scales with how wet the biome is
        return clamp(c.moisture * .75 + (local * .45 + slow) * (.35 + c.moisture) + bias);
    }

    at(x: number, z: number): WeatherSample {
        const c = this.o.climate(x, z), h = this.humidity(x, z);
        const cover = smooth(.25, .85, h), grey = smooth(.6, .95, h);
        const heat = c.temperature, snow = heat < this.o.snowBelow;
        let kind: CloudKind = "clear";
        if (cover > .85) kind = heat > .55 && h > .85 ? "storm" : "overcast";
        else if (cover > .55) kind = heat > .5 ? "towering" : "overcast";
        else if (cover > .15) kind = "fair";
        else if (h > .12) kind = "cirrus";
        const precipitation = smooth(.78, 1, h);
        const storm = kind === "storm" ? smooth(.85, 1, h) * smooth(.5, .8, heat) : 0;
        const base = 1800 - cover * 1100, top = base + (kind === "storm" ? 9000 : kind === "towering" ? 4000 : kind === "overcast" ? 900 : 1200);
        return { humidity: h, cover, grey, kind, base, top, precipitation, snow, storm, temperature: heat };
    }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
