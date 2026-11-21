import type { Layer3D } from "@papit/game-engine";
import type { SkyLight, SkyLook, SkyState, Vec3 } from "./types";

export const SKY_LOOK: SkyLook = {
    zenith: [.16, .34, .78],
    horizon: [.62, .76, .92],
    overcastZenith: [.36, .39, .43],
    overcastHorizon: [.52, .55, .58],
    sunColour: [1, .92, .75],
    cloudLit: [1, .98, .94],
    cloudShade: [.55, .6, .78],
    cloudDark: [.2, .22, .26],
    cloudScale: 2600,
    bands: 3,
    cirrus: .6,
    reach: 60000,
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
uniform vec3 eye, sun, zenith, horizon, oZenith, oHorizon, sunColour, cLit, cShade, cDark;
uniform float cover, grey, base, scale, bands, cirrus, reach;
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
    vec3 zen = mix(zenith, oZenith, overcast), hor = mix(horizon, oHorizon, overcast);

    float up = max(dir.y, 0.0);
    vec3 col = mix(hor, zen, pow(up, .55));
    // sun: glow + disc, both hidden by cloud cover
    float s = max(dot(dir, sun), 0.0), clearSun = 1.0 - smoothstep(.5, 1.0, cover);
    col += sunColour * (pow(s, 6.0) * .25 + pow(s, 60.0) * .35) * (.3 + .7 * clearSun);
    col = mix(col, sunColour * 4.0, smoothstep(.9994, .9997, s) * clearSun);
    if (dir.y < 0.0) col = mix(hor, hor * .85, smoothstep(0.0, -.2, dir.y));

    // fake earth curve so the layer runs into the horizon
    float dy = dir.y + .035;
    if (dy > 0.0) {
        float t = (base - eye.y) / dy;
        vec2 p = eye.xz + dir.xz * t + drift;
        float fade = exp(-t / reach);
        // cirrus: thin streaks high up, stretched along x
        vec2 q = (eye.xz + dir.xz * (t * 4.0) + drift * 1.6) / (scale * 3.0);
        float ci = smoothstep(.55, .85, fbm(q * vec2(.25, 2.5))) * cirrus * (1.0 - overcast) * fade * .6;
        col = mix(col, mix(cLit, hor, .3), ci);

        float d = cloud(p);
        if (d > 0.001) {
            // light: how much less cloud lies towards the sun (cheap thickness)
            vec2 ts = normalize(sun.xz + 1e-4) * scale * .18;
            float l = clamp(.55 + (d - cloud(p + ts)) * 1.6 - (d - .5) * .3, 0.0, 1.0);
            if (bands > 0.0) l = mix(l, floor(l * bands + .5) / bands, .75);
            vec3 shade = mix(cShade, cDark, grey);
            vec3 lit = mix(cLit, cLit * .75 + oHorizon * .25, grey);
            vec3 c = mix(shade, lit * mix(vec3(1), sunColour, .25), l);
            // warm rim on the sun side
            c += sunColour * pow(s, 8.0) * (1.0 - d) * .5;
            c = mix(hor, c, fade);
            col = mix(col, c, smoothstep(0.0, .35, d) * mix(.85, 1.0, cover));
        }
    }
    outColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const U = ["view", "projection", "eye", "sun", "zenith", "horizon", "oZenith", "oHorizon", "sunColour", "cLit", "cShade", "cDark",
    "cover", "grey", "base", "scale", "bands", "cirrus", "reach", "drift"] as const;

type View = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number>; worldPosition?: { x: number; y: number; z: number } };

/**
 * Gradient sky + a toon cloud layer out to the horizon, one full screen triangle at the far plane.
 * Draw it first (it clears nothing, writes no depth). `state` is live: feed it from `@polywar/weather`.
 */
export class Sky {
    readonly look: SkyLook;
    readonly state: SkyState = { sun: [.5, .8, .35], cover: .35, grey: 0, drift: [0, 0], base: 1500 };
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

    /** the horizon colour now (linear): fog should match it */
    horizon(): Vec3 {
        const o = this.overcast(), a = this.look.horizon, b = this.look.overcastHorizon;
        return [a[0] + (b[0] - a[0]) * o, a[1] + (b[1] - a[1]) * o, a[2] + (b[2] - a[2]) * o];
    }

    private overcast() { const { grey, cover } = this.state; return Math.min(1, Math.max(0, grey * .7 + Math.max(cover - .6, 0) * 1.2)); }

    /**
     * Sets `out`'s light from `clear` (the sunny day) dimmed by the cover: sun weaker and greyer, ambient flatter,
     * fog the horizon colour and thicker when grey.
     */
    light(clear: SkyLight, out: SkyLight) {
        const o = this.overcast(), c = this.state.cover;
        const sun = 1 - Math.min(1, Math.max(0, (c - .45) / .5)) * .8;
        out.sunStrength = clear.sunStrength * sun;
        out.sunColor = mix(clear.sunColor, [.8, .82, .85], o);
        out.sky = mix(clear.sky, this.horizon(), o * .8);
        out.ground = clear.ground;
        out.ambient = clear.ambient * (1 + o * .35);
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

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
