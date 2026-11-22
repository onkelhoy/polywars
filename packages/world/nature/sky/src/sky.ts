import type { Layer3D } from "@papit/game-engine";
import type { SkyLight, SkyLook, SkyState, Vec3 } from "./types";

export const SKY_LOOK: SkyLook = {
    zenith: [.16, .34, .78],
    horizon: [.62, .76, .92],
    overcastZenith: [.24, .26, .29],
    overcastHorizon: [.42, .44, .47],
    sunColour: [1, .92, .75],
    cloudLit: [1, .98, .94],
    cloudShade: [.55, .6, .78],
    cloudDark: [.1, .11, .13],
    cloudScale: 2600,
    bands: 3,
    cirrus: .6,
    reach: 60000,
    nightZenith: [.004, .007, .02],
    nightHorizon: [.018, .025, .05],
};

const VERTEX = `#version 300 es
out vec2 vNdc;
void main() {
    vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
    vNdc = p;
    gl_Position = vec4(p, 1.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 outColor;
uniform mat4 view, projection;
uniform vec3 eye, sun, moon, nZenith, nHorizon, zenith, horizon, oZenith, oHorizon, sunColour, cLit, cShade, cDark;
uniform vec3 flashDir;
uniform float flash, time, phase, cover, grey, base, scale, bands, cirrus, reach;
uniform vec2 drift;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
    float s = 0.0, a = .5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, -9.3); a *= .5; }
    return s / .97;
}
// cloud field 0..1 at a spot of the layer: the noise is always there, the cover decides how much shows
float cloud(vec2 p) {
    float d = fbm(p / scale);
    float local = cover + (fbm(p / (scale * 7.0) + 3.7) - .5) * .5;
    float lo = 1.0 - local;
    return smoothstep(lo, lo + .22, d);
}

void main() {
    vec4 far = inverse(projection * mat4(mat3(view))) * vec4(vNdc, 1.0, 1.0);
    vec3 dir = normalize(far.xyz / far.w);
    float overcast = clamp(grey * .7 + max(cover - .6, 0.0) * 1.2, 0.0, 1.0);
    // day 1 .. night 0 by the sun's height; dusk = the sun near the horizon
    float day = smoothstep(-.18, .12, sun.y), dusk = exp(-abs(sun.y + .02) * 9.0);
    vec3 sunCol = mix(vec3(1.0, .42, .16), sunColour, smoothstep(-.02, .3, sun.y));
    vec3 zen = mix(nZenith, mix(zenith, oZenith, overcast), day);
    vec3 hor = mix(nHorizon, mix(horizon, oHorizon, overcast), day);
    // the horizon round the setting sun glows warm
    float toSun = max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-5), normalize(vec3(sun.x, 0.0, sun.z) + 1e-5)), 0.0);
    hor = mix(hor, vec3(.95, .45, .2) * (.4 + .6 * day), dusk * (.25 + .55 * pow(toSun, 3.0)) * (1.0 - overcast * .7));

    float up = max(dir.y, 0.0);
    vec3 col = mix(hor, zen, pow(up, .55));
    float clearSky = 1.0 - smoothstep(.5, 1.0, cover);
    // stars: one maybe per cell of a fine grid on the sphere, twinkling, gone by day and behind cloud
    if (day < 1.0 && dir.y > 0.0) {
        vec3 g = dir * 180.0, cell = floor(g);
        float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        if (h > .965) {
            vec3 c = cell + .5 + (vec3(fract(h * 31.7), fract(h * 57.3), fract(h * 91.1)) - .5) * .6;
            float dd = length(g - c), size = .08 + .14 * fract(h * 13.1);
            float tw = .55 + .45 * sin(time * (1.5 + 4.0 * fract(h * 7.3)) + h * 300.0) * sin(time * 2.3 + h * 50.0);
            float st = smoothstep(size, 0.0, dd) * tw * (.4 + 1.6 * fract(h * 3.7));
            col += vec3(.85, .9, 1.0) * st * (1.0 - day) * smoothstep(0.0, .25, dir.y) * clearSky;
        }
        // a faint milky band
        col += vec3(.02, .025, .04) * smoothstep(.7, 1.0, 1.0 - abs(dot(dir, normalize(vec3(.3, .2, 1.0))))) * fbm(dir.xy * 6.0 + dir.z * 3.0) * (1.0 - day) * clearSky;
    }
    // sun: glow + disc, hidden by cloud cover and the ground
    float s = max(dot(dir, sun), 0.0), above = smoothstep(-.03, .02, sun.y);
    col += sunCol * (pow(s, 6.0) * .25 + pow(s, 60.0) * .35) * (.3 + .7 * clearSky) * above;
    col = mix(col, sunCol * 4.0, smoothstep(.9994, .9997, s) * clearSky * above);
    // moon: a disc lit from the sun's side, faint marks, a cold glow
    float m = dot(dir, moon), mUp = smoothstep(-.02, .03, moon.y) * clearSky;
    if (m > .99) {
        vec3 side = normalize(sun - moon * dot(sun, moon) + vec3(1e-4, 0, 0));
        vec3 off = (dir - moon) / .0185;
        float lit = clamp(dot(normalize(off * vec3(1.0) + moon * sqrt(max(0.0, 1.0 - dot(off, off)))), side) * 3.0 + phase * 2.0 - 1.0, .05, 1.0);
        float marks = .8 + .2 * fbm(off.xy * 4.0 + 3.0);
        float disc = smoothstep(.99983, .99988, m);
        col = mix(col, vec3(.95, .93, .85) * 1.6 * lit * marks, disc * mUp * (1.0 - day * .6));
    }
    col += vec3(.5, .6, .8) * pow(max(m, 0.0), 300.0) * .12 * mUp * (1.0 - day);
    if (dir.y < 0.0) col = mix(hor, hor * .85, smoothstep(0.0, -.2, dir.y));
    col += vec3(.5, .55, .75) * flash * .15 * (.3 + pow(max(dot(dir, flashDir), 0.0), 3.0));

    // what lights the clouds: the sun, the moon at night, a little sky glow
    vec3 key = day > .02 ? sun : moon;
    float keyLight = max(day, .13 * (1.0 - day) * smoothstep(-.05, .1, moon.y) + .05);
    vec3 keyCol = day > .02 ? sunCol : vec3(.6, .68, .9);

    // fake earth curve so the layer runs into the horizon
    float dy = dir.y + .035;
    if (dy > 0.0) {
        float t = (base - eye.y) / dy;
        vec2 p = eye.xz + dir.xz * t + drift;
        float fade = exp(-t / reach);
        // cirrus: thin streaks high up, stretched along x
        vec2 q = (eye.xz + dir.xz * (t * 4.0) + drift * 1.6) / (scale * 3.0);
        float ci = smoothstep(.55, .85, fbm(q * vec2(.25, 2.5))) * cirrus * (1.0 - overcast) * fade * .6;
        col = mix(col, mix(cLit * keyLight * mix(vec3(1), keyCol, .5 + dusk * .5), hor, .3), ci);

        float d = cloud(p);
        if (d > 0.001) {
            // light: how much less cloud lies towards the key light (cheap thickness)
            // under full cover the coverage saturates: shade from the raw noise so heavy skies stay lumpy
            vec2 ts = normalize(key.xz + 1e-4) * scale * .18;
            float raw = fbm(p / scale), rawT = fbm((p + ts) / scale);
            float l = clamp(.55 + (d - cloud(p + ts)) * 1.6 - (d - .5) * .3, 0.0, 1.0);
            l = mix(l, clamp(.45 + (raw - rawT) * 5.0 + (raw - .5) * .8, 0.0, 1.0), smoothstep(.6, 1.0, cover));
            if (bands > 0.0) l = mix(l, floor(l * bands + .5) / bands, .75);
            vec3 shade = mix(cShade, cDark, grey);
            vec3 lit = mix(cLit, vec3(.42, .44, .48), grey * .85);
            vec3 c = mix(shade, lit * mix(vec3(1), keyCol, .25 + dusk * .5), l) * keyLight;
            // warm rim on the sun side, cold on the moon side
            float k = max(dot(dir, key), 0.0);
            c += keyCol * pow(k, 8.0) * (1.0 - d) * .5 * keyLight;
            // lightning lights the cloud from inside, brightest round the bolt
            c += vec3(.75, .8, 1.0) * flash * (.25 + 2.0 * pow(max(dot(dir, flashDir), 0.0), 5.0)) * (.4 + d);
            c = mix(hor, c, fade);
            col = mix(col, c, smoothstep(0.0, .35, d) * mix(.85, 1.0, cover));
        }
    }
    outColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const U = ["view", "projection", "eye", "flash", "flashDir", "sun", "moon", "nZenith", "nHorizon", "time", "phase", "zenith", "horizon", "oZenith", "oHorizon", "sunColour", "cLit", "cShade", "cDark",
    "cover", "grey", "base", "scale", "bands", "cirrus", "reach", "drift"] as const;

type View = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number>; worldPosition?: { x: number; y: number; z: number } };

/**
 * Gradient sky + a toon cloud layer out to the horizon, one full screen triangle at the far plane.
 * Draw it first (it clears nothing, writes no depth). `state` is live: feed it from `@polywar/weather`.
 */
export class Sky {
    readonly look: SkyLook;
    readonly state: SkyState = { sun: [.5, .8, .35], moon: [-.5, -.8, -.35], phase: .5, cover: .35, grey: 0, drift: [0, 0], base: 1500, flash: 0, flashAt: [0, 1, 0] };
    private clock = 0;
    private gl: WebGL2RenderingContext;
    private program?: WebGLProgram;
    private u: Partial<Record<typeof U[number], WebGLUniformLocation | null>> = {};
    private vao: WebGLVertexArrayObject;
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };

    constructor(layer: Layer3D, look: Partial<SkyLook> = {}) {
        this.look = { ...SKY_LOOK, ...look };
        const gl = this.gl = layer.gl;
        this.vao = gl.createVertexArray()!;
        layer.createProgram(`pw-sky-${Math.random().toString(36).slice(2)}`, VERTEX, FRAGMENT).then(p => {
            this.program = p;
            for (const n of U) this.u[n] = gl.getUniformLocation(p, n);
        });
    }

    /**
     * Sun + moon from the clock: `hour` 0..24 (12 = noon, sun highest), `phase` 0 new .. .5 full .. 1 new moon
     * (the moon trails the sun by phase * 24 h). `tilt` how high the sun gets at noon, 0..1 (default .8).
     */
    setTime(hour: number, phase = this.state.phase, tilt = .8) {
        const at = (h: number): Vec3 => {
            const a = (h - 6) / 24 * Math.PI * 2, y = Math.sin(a) * tilt, x = Math.cos(a), z = Math.sin(a) * Math.sqrt(1 - tilt * tilt) + .2;
            const l = Math.hypot(x, y, z);
            return [x / l, y / l, z / l];
        };
        this.state.sun = at(hour);
        this.state.moon = at(hour - phase * 24);
        this.state.phase = phase;
    }

    /** 1 day .. 0 night */
    get day() { return smooth(-.18, .12, this.state.sun[1] / (Math.hypot(...this.state.sun) || 1)); }

    /** the horizon colour now (linear): fog should match it */
    horizon(): Vec3 {
        const o = this.overcast(), a = this.look.horizon, b = this.look.overcastHorizon;
        return mix(this.look.nightHorizon, [a[0] + (b[0] - a[0]) * o, a[1] + (b[1] - a[1]) * o, a[2] + (b[2] - a[2]) * o], this.day);
    }

    private overcast() { const { grey, cover } = this.state; return Math.min(1, Math.max(0, grey * .7 + Math.max(cover - .6, 0) * 1.2)); }

    /**
     * Sets `out`'s light from `clear` (the sunny day) dimmed by the cover: sun weaker and greyer, ambient flatter,
     * fog the horizon colour and thicker when grey.
     */
    light(clear: SkyLight, out: SkyLight) {
        const o = this.overcast(), c = this.state.cover;
        const sun = 1 - Math.min(1, Math.max(0, (c - .45) / .5)) * .8;
        // night: the moon is the sun (cold, weak, by its phase), the ambient sinks
        const day = this.day, s = this.state, moonUp = smooth(-.05, .1, s.moon[1]);
        const low = smooth(-.05, .35, s.sun[1]), warm: Vec3 = [1, .55, .3];
        const moonLight = .12 * moonUp * (1 - Math.abs(s.phase - .5) * 1.4);
        if (out.sunDirection) out.sunDirection = day > .02 ? s.sun : s.moon;
        out.sunStrength = clear.sunStrength * sun * (day > .02 ? day : moonLight / Math.max(.01, clear.sunStrength));
        out.sunColor = day > .02 ? mix(mix(warm, clear.sunColor, low), [.8, .82, .85], o) : [.6, .7, 1];
        out.sky = mix([.03, .04, .08], mix(clear.sky, this.horizon(), o * .8), day);
        out.ground = mix([.02, .02, .025], clear.ground, day);
        out.ambient = clear.ambient * (1 + o * .35) * (.12 + .88 * day);
        out.ambient += s.flash * .8;
        out.fogColor = this.horizon();
        out.fogDensity = clear.fogDensity + o * .0006;
    }

    draw(camera: View) {
        const gl = this.gl, u = this.u, l = this.look, s = this.state;
        if (!this.program) return;
        this.f32.view.set(camera.viewMatrix);
        this.f32.projection.set(camera.projectionMatrix);
        const e = camera.worldPosition ?? { x: 0, y: 0, z: 0 };
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(u.view!, false, this.f32.view);
        gl.uniformMatrix4fv(u.projection!, false, this.f32.projection);
        gl.uniform3f(u.eye!, e.x, e.y, e.z);
        const sl = Math.hypot(...s.sun) || 1;
        gl.uniform3f(u.sun!, s.sun[0] / sl, s.sun[1] / sl, s.sun[2] / sl);
        gl.uniform1f(u.flash!, s.flash); gl.uniform3fv(u.flashDir!, s.flashAt);
        const ml = Math.hypot(...s.moon) || 1;
        gl.uniform3f(u.moon!, s.moon[0] / ml, s.moon[1] / ml, s.moon[2] / ml);
        gl.uniform3fv(u.nZenith!, l.nightZenith); gl.uniform3fv(u.nHorizon!, l.nightHorizon);
        gl.uniform1f(u.time!, (this.clock = performance.now() / 1000) % 1e4); gl.uniform1f(u.phase!, s.phase);
        gl.uniform3fv(u.zenith!, l.zenith); gl.uniform3fv(u.horizon!, l.horizon);
        gl.uniform3fv(u.oZenith!, l.overcastZenith); gl.uniform3fv(u.oHorizon!, l.overcastHorizon);
        gl.uniform3fv(u.sunColour!, l.sunColour); gl.uniform3fv(u.cLit!, l.cloudLit);
        gl.uniform3fv(u.cShade!, l.cloudShade); gl.uniform3fv(u.cDark!, l.cloudDark);
        gl.uniform1f(u.cover!, s.cover); gl.uniform1f(u.grey!, s.grey); gl.uniform1f(u.base!, s.base);
        gl.uniform1f(u.scale!, l.cloudScale); gl.uniform1f(u.bands!, l.bands); gl.uniform1f(u.cirrus!, l.cirrus);
        gl.uniform1f(u.reach!, l.reach);
        gl.uniform2f(u.drift!, s.drift[0] % 1e6, s.drift[1] % 1e6);
        gl.depthMask(false);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
    }
}

const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
