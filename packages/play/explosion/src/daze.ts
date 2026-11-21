import type { Layer3D } from "@papit/game-engine";

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
    // one triangle over the screen
    vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
    vUv = p * .5 + .5;
    gl_Position = vec4(p, 0.0, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D last;
uniform float amount, time, lid;
out vec4 outColor;
void main() {
    // the frames before smear over this one: blurred, doubled, swaying
    float r = amount * .03;
    vec2 sway = vec2(sin(time * 1.7), cos(time * 1.3)) * amount * .02;
    vec3 c = vec3(0.0);
    for (int i = 0; i < 8; i++) {
        float a = float(i) * .785;
        c += texture(last, vUv + sway + vec2(cos(a), sin(a)) * r).rgb;
    }
    c /= 8.0;
    // eyelids: top and bottom close in to a soft line, a warm dark through them
    float open = (1.0 - lid) * .62, edge = abs(vUv.y - .5) - open + abs(vUv.x - .5) * .12 * lid;
    float shut = lid > .98 ? 1.0 : smoothstep(-.04, .04, edge);
    float a = min(.95, amount * 1.6);
    vec3 dark = vec3(.06, .02, .02);
    outColor = vec4(mix(c * a, dark, shut) / max(.001, a + shut - a * shut), a + shut - a * shut);
}`;

/**
 * Being dazed by a blast: what you see smears (the last frames ghost over the new one, blurred and doubled),
 * strongest right after the hit and clearing over seconds. `hit(amount)` then `draw()` last thing each frame.
 */
export class Daze {
    private gl: WebGL2RenderingContext;
    private program?: WebGLProgram;
    private u: Record<string, WebGLUniformLocation | null> = {};
    private last?: { texture: WebGLTexture; w: number; h: number };
    private vao: WebGLVertexArrayObject;
    private strength = 0;
    private age = 0;
    private length = 1;
    private time = 0;
    /** 0..1 eyes shut (`Knockdown.blink`): lids close over the view */
    blink = 0;

    constructor(layer: Layer3D) {
        const gl = this.gl = layer.gl;
        this.vao = gl.createVertexArray()!;
        layer.createProgram(`pw-daze-${Math.random().toString(36).slice(2)}`, VERTEX, FRAGMENT).then(p => {
            this.program = p;
            for (const n of ["last", "amount", "time", "lid"]) this.u[n] = gl.getUniformLocation(p, n);
        });
    }

    /** 0..1 how dazed now */
    get amount() {
        const t = this.age / this.length;
        return t >= 1 ? 0 : this.strength * (1 - t);
    }

    /** a blast hit: `amount` 0..1 (by pressure); lasts 2 to 10 s */
    hit(amount: number) {
        amount = Math.min(1, Math.max(0, amount));
        if (amount <= this.amount) return;
        this.strength = amount;
        this.age = 0;
        this.length = 2 + 8 * amount;
    }

    /** takes `part` (0..1) of what's left off at once (a blink clears the eyes a bit) */
    clear(part: number) {
        const now = this.amount;
        if (now <= 0) return;
        const left = Math.max(.5, this.length - this.age);
        this.strength = now * (1 - part); this.age = 0; this.length = left;
    }

    update(dt: number) {
        this.age += dt;
        this.time += dt;
    }

    /** over what is drawn this frame, then keeps the frame for the next */
    draw() {
        const gl = this.gl, amount = this.amount;
        if (!this.program || amount <= .01 && this.blink <= .01) return;
        const vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
        if (!this.last || this.last.w !== vp[2] || this.last.h !== vp[3])
        {
            if (this.last) gl.deleteTexture(this.last.texture);
            const texture = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vp[2], vp[3], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, vp[0], vp[1], vp[2], vp[3]);
            this.last = { texture, w: vp[2], h: vp[3] };
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.last.texture);
        gl.useProgram(this.program);
        gl.uniform1i(this.u.last, 0);
        gl.uniform1f(this.u.amount, amount);
        gl.uniform1f(this.u.time, this.time);
        gl.uniform1f(this.u.lid, this.blink);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        // this frame (with the smear in it) is the next one's past: it trails off
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, vp[0], vp[1], vp[2], vp[3]);
    }
}
