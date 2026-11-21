import type { AudioMixer } from "@papit/audio";
import type { PlayOptions, Scene, SoundsFile, Vec3, WeaponAudioOptions } from "./types";

/** how far each kind of sound carries: [refDistance, rolloff, maxDistance] */
const REACH = { shot: [6, 1, 3000], part: [1, 1.6, 60], brass: [.6, 2, 30] } as const;

/** 16 ways round, for the scene guess */
const AROUND: Vec3[] = Array.from({ length: 16 }, (_, i): Vec3 => [Math.cos(i * Math.PI / 8), 0, Math.sin(i * Math.PI / 8)]);
/** a wall must also stand this much above the shooter's height (a crate or desk doesn't) */
const WALL_HIGH = .9;

/**
 * Weapon sounds in 3D through `@papit/audio`: sets from `@polywar/sfx-gen` (`<set>/sounds.json`), a random variant
 * (never the same twice in a row) at a random pitch, late by the speed of sound. Shots pick their file by the
 * scene, guessed by rays round the shooter: a roof and walls close all round is `indoor`, a few walls `walls`, else `open`.
 * Only things taller than the shooter count as walls.
 */
export class WeaponAudio {
    readonly mixer: AudioMixer;
    private sets = new Map<string, Promise<SoundsFile | null>>();
    private files = new Map<string, Record<string, string[]>>();
    private last = new Map<string, number>();
    private listener: Vec3 = [0, 0, 0];
    private guess?: { at: Vec3; time: number; scene: Scene };

    constructor(readonly options: WeaponAudioOptions) {
        this.mixer = options.mixer;
    }

    private get base() { return this.options.base ?? "/assets/audio/effects/weapons/"; }

    /** Loads a set (once): its sounds.json and every file in it. Missing sets stay quiet. */
    load(set: string): Promise<SoundsFile | null> {
        let loading = this.sets.get(set);
        if (!loading)
        {
            const url = `${this.base}${set}/`;
            loading = fetch(`${url}sounds.json`).then(r => r.ok ? r.json() as Promise<SoundsFile> : null).then(async json => {
                if (!json) return null;
                await Promise.all(Object.values(json.sounds).flat().map(file => this.mixer.has(`${set}/${file}`) ? undefined : this.mixer.load(`${set}/${file}`, url + file)));
                this.files.set(set, json.sounds);
                return json;
            }).catch(() => null);
            this.sets.set(set, loading);
        }
        return loading;
    }

    /** where the ear is: call every frame (the camera) */
    setListener(position: Vec3, forward: Vec3) {
        this.listener = position;
        this.mixer.setListener({ x: position[0], y: position[1], z: position[2] }, { x: forward[0], y: forward[1], z: forward[2] });
    }

    /**
     * The scene round `at`, cached while the shooter stays within a metre for half a second.
     * Rays: 16 round out to 30 m, each at `at` and `WALL_HIGH` above it (a wall blocks both, near the same
     * distance: small props don't count), plus 3 up 20 m (a roof covers at least 2).
     */
    scene(at: Vec3, time = performance.now() / 1000): Scene {
        const cast = this.options.cast, g = this.guess;
        if (!cast) return "open";
        if (g && time - g.time < .5 && Math.hypot(at[0] - g.at[0], at[1] - g.at[1], at[2] - g.at[2]) < 1) return g.scene;
        const reach = (from: Vec3, d: Vec3, max: number) => {
            const hit = cast(from, [from[0] + d[0] * max, from[1] + d[1] * max, from[2] + d[2] * max]);
            return hit ? Math.hypot(hit.point[0] - from[0], hit.point[1] - from[1], hit.point[2] - from[2]) : Infinity;
        };
        const high: Vec3 = [at[0], at[1] + WALL_HIGH, at[2]];
        const wall = (d: Vec3) => {
            const low = reach(at, d, 30);
            if (low === Infinity) return Infinity;
            const top = reach(high, d, 30);
            return Math.abs(top - low) < 2 ? Math.max(low, top) : Infinity;
        };
        const round = AROUND.map(wall);
        const roof = [at, [at[0] + 1.5, at[1], at[2]], [at[0], at[1], at[2] + 1.5]].filter(p => reach(p as Vec3, [0, 1, 0], 20) < 8).length;
        const close = round.filter(d => d < 12).length, near = round.filter(d => d < 25).length;
        const scene: Scene = roof >= 2 && close >= 11 ? "indoor" : near >= 3 ? "walls" : "open";
        this.guess = { at: [...at], time, scene };
        return scene;
    }

    /** A shot of `set` at `at`: `shot-<scene>` (falls back to `shot-open`). */
    shot(set: string, at: Vec3, options: PlayOptions = {}) {
        const sounds = this.files.get(set);
        if (!sounds) return void this.load(set);
        const scene = this.scene(at);
        return this.play(set, sounds[`shot-${scene}`] ? `shot-${scene}` : "shot-open", at, "shot", options);
    }

    /** A part of the action (`bolt-open`, `mag-in`, ... any name in the set). Unknown names stay quiet. */
    part(set: string, cue: string, at: Vec3, options: PlayOptions = {}) {
        if (!this.files.get(set)) return void this.load(set);
        return this.play(set, cue, at, "part", options);
    }

    /** A case landing on `surface` (the `brass` set), `size` 1 for a rifle case, smaller rings higher. */
    brass(surface: string, at: Vec3, size = 1, volume = 1) {
        if (!this.files.get("brass")) return void this.load("brass");
        return this.play("brass", surface, at, "brass", { volume, rate: 1 / Math.sqrt(Math.max(.3, size)) });
    }

    private play(set: string, name: string, at: Vec3, kind: keyof typeof REACH, options: PlayOptions) {
        const variants = this.files.get(set)?.[name];
        if (!variants?.length) return;
        const key = `${set}/${name}`, previous = this.last.get(key) ?? -1;
        let pick = Math.floor(Math.random() * variants.length);
        if (pick === previous && variants.length > 1) pick = (pick + 1) % variants.length;
        this.last.set(key, pick);
        const spread = this.options.pitch ?? .04, [ref, rolloff, max] = REACH[kind];
        const l = this.listener, distance = Math.hypot(at[0] - l[0], at[1] - l[1], at[2] - l[2]);
        const speed = this.options.sound ?? 343, context = this.mixer.context;
        return this.mixer.play(`${set}/${variants[pick]}`, {
            bus: this.options.bus ?? "sfx",
            volume: options.volume ?? 1,
            rate: (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread),
            when: speed > 0 ? context.currentTime + distance / speed : undefined,
            spatial: { position: { x: at[0], y: at[1], z: at[2] }, refDistance: ref, rolloff, maxDistance: max },
        });
    }
}
