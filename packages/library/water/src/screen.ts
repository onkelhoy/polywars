import type { Layer3D } from "@papit/game-engine";
import { NOISE_GLSL } from "./shaders";
import { linear } from "./material";

/**
 * `blur` / `wobble` / `bubbles` 0..1+ under water; `rinse` seconds of drops running off the screen after surfacing (0 off);
 * `tint` 0..1 how much the screen takes the water colour.
 */
export type ScreenOptions = { enabled: boolean; blur: number; wobble: number; bubbles: number; rinse: number; tint: number };

export const SCREEN_OPTIONS: ScreenOptions = { enabled: true, blur: 1, wobble: 1, bubbles: 1, rinse: 1.3, tint: .25 };

const VERTEX = `#version 300 es
void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(p * 2.0 - 1.0, 0, 1);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform vec2 res;
uniform vec3 tintColor;
uniform float time, under, rinse, blur, wobble, bubbles, tint;
${NOISE_GLSL}
out vec4 outColor;

vec4 soft(vec2 q, float r) {
    vec2 o = r / res;
    return (texture(scene, q) * 4.0 + texture(scene, q + vec2(o.x, 0)) + texture(scene, q - vec2(o.x, 0))
        + texture(scene, q + vec2(0, o.y)) + texture(scene, q - vec2(0, o.y))) / 8.0;
}

void main() {
    vec2 uv = gl_FragCoord.xy / res, a = vec2(uv.x * res.x / res.y, uv.y);
    vec4 c;
    if (under > .5) {
        vec2 w = vec2(sin(uv.y * 18.0 + time * 1.7), cos(uv.x * 14.0 + time * 1.3)) * .0025 * wobble;
        c = soft(uv + w, blur * 2.5);
        // tiny bubbles rising near the edges and corners
        vec2 cu = min(uv, 1.0 - uv) * vec2(res.x / res.y, 1);
        float edge = 1.0 - smoothstep(.08, .3, length(cu));
        for (int k = 0; k < 2; k++) {
            float s = k == 0 ? .028 : .018, sp = k == 0 ? .07 : .11, layer = float(k) * 7.0;
            vec2 p = a / s - vec2(0, time * sp / s);
            p.x += sin(time * 1.3 + floor(p.y) * 2.1) * .15;
            vec2 id = floor(p), f = fract(p);
            float h = hash2(id + layer), keep = step(h, .3 * bubbles * edge);
            vec2 ctr = vec2(.3 + .4 * hash2(id + layer + 3.0), .5);
            float rr = .08 + .1 * hash2(id + layer + 5.0), d = length(f - ctr);
            float body = (1.0 - smoothstep(rr * .85, rr, d)) * keep;
            float rim = body * smoothstep(rr * .5, rr * .95, d);
            float hi = (1.0 - smoothstep(0.0, rr * .3, length(f - ctr - vec2(-.35, .35) * rr))) * keep;
            c.rgb = mix(c.rgb, texture(scene, uv + (f - ctr) * s * .4).rgb * 1.1, body);
            c.rgb += rim * .25 + hi * .5;
        }
        c.rgb *= 1.0 - .35 * pow(length(uv - .5) * 1.3, 2.0);
        c.rgb = mix(c.rgb, tintColor, tint * .4);
    } else {
        // rinse: drops sliding down with a trail, small droplets drying off, a wet blur fading
        float t = rinse, fade = 1.0 - smoothstep(.55, 1.0, t);
        vec2 off = vec2(0);
        float col = .028, id = floor(a.x / col), h = hash2(vec2(id, 1)), h2 = hash2(vec2(id, 2));
        float x = (fract(a.x / col) - .5) * col, r = col * (.18 + .2 * h);
        float y = 1.05 - h2 * .5 - t * (.5 + h * 1.4);
        vec2 dd = vec2(x, (a.y - y) * 1.3);
        float drop = (1.0 - smoothstep(r * .8, r, length(dd))) * step(h, .55);
        float trail = (1.0 - smoothstep(r * .25, r * .45, abs(x))) * step(y, a.y) * (1.0 - smoothstep(0.0, .12 + h2 * .2, a.y - y)) * step(h, .55);
        off += dd / r * drop * .02 + vec2(x / r, 0) * trail * .006;
        vec2 g = a / .04, gid = floor(g), gf = fract(g) - .5;
        float sr = .12 + .15 * hash2(gid + 9.0), dot = (1.0 - smoothstep(sr * .7, sr, length(gf))) * step(hash2(gid), .3) * (1.0 - smoothstep(.2, .7, t));
        off += gf / sr * dot * .01;
        float m = max(max(drop, trail), dot) * fade;
        c = soft(uv + off * fade, blur * 2.0 * (1.0 - t));
        c.rgb += m * .08;
    }
    outColor = c;
}`;

/**
 * Screen effects for water, drawn last over the finished frame (it copies the frame, so it costs only while active):
 * under water a soft blur, a slow wobble, the water's tint and tiny bubbles near the corners; on surfacing drops run off the
 * screen for `rinse` seconds. Call `draw` every frame with whether the eye is under water.
 */
export class WaterScreen {
    options: ScreenOptions;
    private gl: WebGL2RenderingContext;
    private program?: { name: string; program: WebGLProgram };
    private vao: WebGLVertexArrayObject;
    private fbo?: WebGLFramebuffer;
    private tex?: WebGLTexture;
    private size = [0, 0];
    private wasUnder = false;
    private surfaced = -Infinity;
    private u = new Map<string, WebGLUniformLocation | null>();

    constructor(readonly layer: Layer3D, options: Partial<ScreenOptions> = {}) {
        this.gl = layer.gl;
        this.options = { ...SCREEN_OPTIONS, ...options };
        this.vao = this.gl.createVertexArray()!;
        const name = `water-screen-${Math.random().toString(36).slice(2)}`;
        layer.createProgram(name, VERTEX, FRAGMENT).then(program => this.program = { name, program });
    }

    /** true while something shows (under water or rinsing) */
    active(under: boolean, time: number) {
        const o = this.options;
        return o.enabled && (under || (o.rinse > 0 && time - this.surfaced < o.rinse));
    }

    /** `under`: the eye is below water; `color` the water's colour (sRGB hex) for the tint; `time` seconds */
    draw(under: boolean, time: number, color = "#1f6273") {
        if (this.wasUnder && !under) this.surfaced = time;
        this.wasUnder = under;
        if (!this.program || !this.active(under, time)) return;
        const gl = this.gl, o = this.options, p = this.program.program;
        const target = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const [, , w, h] = gl.getParameter(gl.VIEWPORT) as Int32Array;
        this.ensure(w, h);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo!);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);

        const depth = gl.isEnabled(gl.DEPTH_TEST), blend = gl.isEnabled(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(p);
        const u = (n: string) => this.u.has(n) ? this.u.get(n)! : (this.u.set(n, gl.getUniformLocation(p, n)), this.u.get(n)!);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex!);
        gl.uniform1i(u("scene"), 0);
        gl.uniform2f(u("res"), w, h);
        gl.uniform1f(u("time"), time);
        gl.uniform1f(u("under"), under ? 1 : 0);
        gl.uniform1f(u("rinse"), Math.min(1, (time - this.surfaced) / Math.max(o.rinse, .01)));
        gl.uniform1f(u("blur"), o.blur);
        gl.uniform1f(u("wobble"), o.wobble);
        gl.uniform1f(u("bubbles"), o.bubbles);
        gl.uniform1f(u("tint"), o.tint);
        gl.uniform3fv(u("tintColor"), linear(color));
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        if (depth) gl.enable(gl.DEPTH_TEST);
        if (blend) gl.enable(gl.BLEND);
    }

    destroy() {
        const gl = this.gl;
        gl.deleteVertexArray(this.vao);
        if (this.fbo) gl.deleteFramebuffer(this.fbo);
        if (this.tex) gl.deleteTexture(this.tex);
        if (this.program) this.layer.deleteProgram(this.program.name);
    }

    private ensure(w: number, h: number) {
        if (this.size[0] === w && this.size[1] === h && this.fbo) return;
        const gl = this.gl;
        this.size = [w, h];
        this.tex ??= gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const target = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        this.fbo ??= gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    }
}
