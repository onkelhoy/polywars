import type { Layer3D } from "@papit/game-engine";
import type { PrecipitationLook, PrecipitationOptions, PrecipitationState } from "./types";

export const PRECIPITATION_LOOK: PrecipitationLook = {
    rain: [.72, .76, .82], snow: [.95, .96, 1],
    rainSpeed: 9, snowSpeed: 1.1, streak: .035, width: .012, flake: .035, splash: .09,
    wet: 1 / 90, dry: 1 / 600,
};

// drops: all on the GPU, each instance a seeded spot in a box that wraps round the eye, world anchored
const DROP_VS = `#version 300 es
uniform mat4 view, projection;
uniform vec3 eye;
uniform float time, box, height, speed, streak, width, snow;
uniform vec2 wind;
out vec2 vUv;
out float vFade;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
    float i = float(gl_InstanceID);
    vec3 h = vec3(hash(i * 1.17), hash(i * 2.31 + 4.1), hash(i * 3.73 + 9.2));
    float fall = time * speed * (.85 + .3 * hash(i * 5.1));
    vec2 blow = wind * time;
    // snow wobbles
    vec2 wob = snow * vec2(sin(time * 1.3 + i), cos(time * 1.1 + i * 1.7)) * .4;
    vec3 p;
    p.x = eye.x + mod(h.x * box + blow.x - eye.x, box) - box * .5 + wob.x;
    p.z = eye.z + mod(h.z * box + blow.y - eye.z, box) - box * .5 + wob.y;
    p.y = eye.y + mod(h.y * height - fall - eye.y, height) - height * .5;
    vec3 vel = vec3(wind.x, -speed, wind.y);
    vec3 to = normalize(eye - p);
    vec3 axis = snow > .5 ? normalize(cross(to, vec3(1, 0, 0))) : normalize(vel);
    vec3 side = normalize(cross(axis, to));
    int c = gl_VertexID; // 0..5, two triangles
    vec2 q = vec2(c == 1 || c == 2 || c == 4 ? 1.0 : -1.0, c == 2 || c == 4 || c == 5 ? 1.0 : -1.0);
    float len = snow > .5 ? width : length(vel) * streak * .5;
    vec3 w = p + side * q.x * width + axis * q.y * len;
    vUv = q;
    float d = length(p - eye);
    vFade = smoothstep(.6, 2.0, d) * (1.0 - smoothstep(box * .3, box * .5, d));
    gl_Position = projection * view * vec4(w, 1.0);
}`;
const DROP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vFade;
uniform vec3 colour;
uniform float alpha, snow;
out vec4 outColor;
void main() {
    float a = snow > .5 ? 1.0 - smoothstep(.5, 1.0, length(vUv)) : (1.0 - abs(vUv.x)) * (1.0 - vUv.y * vUv.y);
    a *= alpha * vFade;
    outColor = vec4(pow(colour, vec3(1.0 / 2.2)) * a, a);
}`;

// splashes: a ring on the ground + a little crown, per instance (x, y, z, age 0..1)
const SPLASH_VS = `#version 300 es
layout(location = 0) in vec4 splash;
uniform mat4 view, projection;
uniform vec3 eye;
uniform float size;
out vec2 vUv;
out float vAge;
flat out int vPart;
void main() {
    int c = gl_VertexID % 6, part = gl_VertexID / 6;
    vec2 q = vec2(c == 1 || c == 2 || c == 4 ? 1.0 : -1.0, c == 2 || c == 4 || c == 5 ? 1.0 : -1.0);
    vec3 p = splash.xyz;
    float age = splash.w;
    vec3 w;
    if (part == 0) w = p + vec3(q.x, .01, q.y) * size * (.3 + age);
    else {
        vec3 to = normalize(eye - p), side = normalize(cross(vec3(0, 1, 0), to));
        w = p + side * q.x * size * .7 + vec3(0, (q.y * .5 + .5) * size * 1.3 * (1.0 - age * .5), 0);
    }
    vUv = q; vAge = age; vPart = part;
    gl_Position = projection * view * vec4(w, 1.0);
}`;
const SPLASH_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vAge;
flat in int vPart;
uniform vec3 colour;
uniform float alpha;
out vec4 outColor;
void main() {
    float a;
    if (vPart == 0) { float r = length(vUv); a = smoothstep(.7, .85, r) * (1.0 - smoothstep(.85, 1.0, r)); a *= 1.0 - vAge; }
    else {
        // crown: two thin spikes flung out, gone fast
        float y = vUv.y * .5 + .5, x = abs(vUv.x);
        a = (1.0 - smoothstep(.0, .12, abs(x - (.15 + y * .6)))) * (1.0 - y) * (1.0 - smoothstep(.0, .5, vAge));
    }
    a *= alpha;
    outColor = vec4(pow(colour, vec3(1.0 / 2.2)) * a, a);
}`;

type View = { viewMatrix: ArrayLike<number>; projectionMatrix: ArrayLike<number>; worldPosition?: { x: number; y: number; z: number } };

/**
 * Rain and snow round the camera. Drops live on the GPU (a wrapping box, no CPU cost), splashes on the CPU
 * (ground height from `ground`). `wetness` 0..1 rises while it rains and dries slowly: feed it to materials.
 * Draw after the opaque world (depth test, no depth write).
 */
export class Precipitation {
    readonly look: PrecipitationLook;
    readonly state: PrecipitationState = { intensity: 0, snow: false, wind: [0, 0] };
    /** 0..1 how wet the ground is */
    wetness = 0;
    /** 0..1 snow lying */
    snowCover = 0;
    private o: Required<PrecipitationOptions>;
    private gl: WebGL2RenderingContext;
    private drops?: { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
    private splashP?: { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
    private vao: WebGLVertexArrayObject;
    private splashVao: WebGLVertexArrayObject;
    private splashBuf: WebGLBuffer;
    private splash: Float32Array;
    private live = 0;
    private time = 0;
    private carry = 0;
    private eye: [number, number, number] = [0, 0, 0];
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };

    constructor(layer: Layer3D, options: PrecipitationOptions = {}, look: Partial<PrecipitationLook> = {}) {
        this.o = { drops: 24000, box: 60, height: 30, ground: () => 0, splashes: 3000, ...options };
        this.look = { ...PRECIPITATION_LOOK, ...look };
        const gl = this.gl = layer.gl;
        this.vao = gl.createVertexArray()!;
        this.splash = new Float32Array(this.o.splashes * 4);
        this.splashVao = gl.createVertexArray()!;
        this.splashBuf = gl.createBuffer()!;
        gl.bindVertexArray(this.splashVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.splashBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this.splash.byteLength, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.bindVertexArray(null);
        const id = Math.random().toString(36).slice(2);
        const uniforms = (p: WebGLProgram, names: string[]) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
        layer.createProgram(`pw-drops-${id}`, DROP_VS, DROP_FS).then(p => {
            this.drops = { p, u: uniforms(p, ["view", "projection", "eye", "time", "box", "height", "speed", "streak", "width", "snow", "wind", "colour", "alpha"]) };
        });
        layer.createProgram(`pw-splash-${id}`, SPLASH_VS, SPLASH_FS).then(p => {
            this.splashP = { p, u: uniforms(p, ["view", "projection", "eye", "size", "colour", "alpha"]) };
        });
    }

    update(dt: number) {
        const s = this.state, l = this.look, k = s.intensity;
        this.time += dt;
        // ground: wet while it rains, snow lies when it snows, both go slowly
        if (k > .01 && !s.snow) this.wetness = Math.min(1, this.wetness + l.wet * k * dt);
        else this.wetness = Math.max(0, this.wetness - l.dry * dt);
        if (k > .01 && s.snow) this.snowCover = Math.min(1, this.snowCover + l.wet * .5 * k * dt);
        else this.snowCover = Math.max(0, this.snowCover - l.dry * .5 * dt);
        // splashes age out, new ones land round the eye (rain only)
        const life = .35, d = this.splash;
        for (let i = 0; i < this.live; i++)
        {
            d[i * 4 + 3] += dt / life;
            if (d[i * 4 + 3] >= 1) { this.live--; d.copyWithin(i * 4, this.live * 4, this.live * 4 + 4); i--; }
        }
        if (s.snow || k <= 0) return;
        const r = this.o.box * .4;
        this.carry += dt * k * k * this.o.splashes / life * .9;
        for (; this.carry >= 1 && this.live < this.o.splashes; this.carry--)
        {
            // more near the eye (that's where they show)
            const a = Math.random() * Math.PI * 2, m = r * Math.pow(Math.random(), .7);
            const x = this.eye[0] + Math.cos(a) * m, z = this.eye[2] + Math.sin(a) * m, o = this.live++ * 4;
            d[o] = x; d[o + 1] = this.o.ground(x, z); d[o + 2] = z; d[o + 3] = Math.random() * .2;
        }
        this.carry = Math.min(this.carry, 1);
    }

    draw(camera: View) {
        const gl = this.gl, s = this.state, l = this.look;
        const e = camera.worldPosition ?? { x: 0, y: 0, z: 0 };
        this.eye = [e.x, e.y, e.z];
        if (s.intensity <= .001) return;
        this.f32.view.set(camera.viewMatrix);
        this.f32.projection.set(camera.projectionMatrix);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const snow = s.snow ? 1 : 0, colour = s.snow ? l.snow : l.rain;
        if (this.drops)
        {
            const { p, u } = this.drops;
            gl.useProgram(p);
            gl.uniformMatrix4fv(u.view, false, this.f32.view);
            gl.uniformMatrix4fv(u.projection, false, this.f32.projection);
            gl.uniform3f(u.eye, e.x, e.y, e.z);
            gl.uniform1f(u.time, this.time);
            gl.uniform1f(u.box, this.o.box);
            gl.uniform1f(u.height, this.o.height);
            gl.uniform1f(u.speed, s.snow ? l.snowSpeed : l.rainSpeed);
            gl.uniform1f(u.streak, l.streak);
            gl.uniform1f(u.width, s.snow ? l.flake : l.width);
            gl.uniform1f(u.snow, snow);
            gl.uniform2f(u.wind, s.wind[0], s.wind[1]);
            gl.uniform3fv(u.colour, colour);
            // mild = few, faint drops; dense = all of them, brighter
            gl.uniform1f(u.alpha, s.snow ? .9 : .25 + .35 * s.intensity);
            gl.bindVertexArray(this.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.round(this.o.drops * Math.pow(s.intensity, 1.3)));
        }
        if (this.splashP && this.live)
        {
            const { p, u } = this.splashP;
            gl.useProgram(p);
            gl.uniformMatrix4fv(u.view, false, this.f32.view);
            gl.uniformMatrix4fv(u.projection, false, this.f32.projection);
            gl.uniform3f(u.eye, e.x, e.y, e.z);
            gl.uniform1f(u.size, l.splash);
            gl.uniform3fv(u.colour, l.rain);
            gl.uniform1f(u.alpha, .55);
            gl.bindVertexArray(this.splashVao);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.splashBuf);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.splash, 0, this.live * 4);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 12, this.live);
        }
        gl.bindVertexArray(null);
        gl.depthMask(true);
    }
}
