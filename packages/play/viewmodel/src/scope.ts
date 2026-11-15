import type { Layer3D } from "@papit/game-engine";
import { MeshBuilder, type Mesh } from "@papit/game-mesh";
import { compose, direction, invertRigid, mat4, multiply, perspective, point, type Mat4, type Vec3 } from "./math";
import type { Hold } from "./types";

/** Where a scope sits on a gun (item space) and its glass. */
export type ScopeMount = {
    /** eyepiece centre (the eye end), item space */
    eyepiece: Vec3;
    /** tube length ahead of the eyepiece, m */
    length: number;
    /** eyepiece glass radius, m */
    lens: number;
    /** objective centre (the far end of the tube axis), item space; default `length` straight ahead */
    objective?: Vec3;
};

const VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
out vec2 vScreen;
void main() { vScreen = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;

/**
 * The eyepiece on screen: a circle at `centre` (ndc) with `radius` (ndc y). Inside it the scope's picture, seen
 * through the exit pupil: shifted by `offset` (in radii) when the eye isn't on the axis, black where it misses
 * (the scope shadow). A duplex reticle on the picture.
 */
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vScreen;
uniform sampler2D picture;
uniform vec2 centre, offset;
uniform float radius, aspect, pupil, light;
out vec4 outColor;
void main() {
    vec2 p = vec2((vScreen.x - centre.x) * aspect, vScreen.y - centre.y) / radius;
    float d = length(p);
    if (d > 1.0) discard;
    // the picture fills the glass; the reticle sits on its middle
    vec3 colour = texture(picture, p * 0.5 + 0.5).rgb;
    float px = 1.5 / (radius * 600.0);
    float thin = step(abs(p.x), px) * step(abs(p.y), 0.9) + step(abs(p.y), px) * step(abs(p.x), 0.9);
    float thick = (step(abs(p.x), px * 4.0) * step(0.28, abs(p.y))) + (step(abs(p.y), px * 4.0) * step(0.28, abs(p.x)));
    colour = mix(colour, vec3(0.02), clamp(thin + thick, 0.0, 1.0));
    // exit pupil: bright where the eye lines up, a black crescent where it doesn't
    float e = length(p - offset);
    float seen = 1.0 - smoothstep(pupil - 0.12, pupil, e);
    // darker towards the glass's own edge
    seen *= (1.0 - smoothstep(0.82, 1.0, d) * 0.7) * light;
    outColor = vec4(colour * seen, 1.0);
}`;

let count = 0;

/**
 * A rifle scope: renders the scene magnified into its own picture (`begin` / `end` around the host's draw),
 * then `overlay` puts it on the eyepiece with the scope shadow and reticle. `zoom` is the magnification.
 */
export class Scope {
    zoom = 4;
    /** picture size, px */
    readonly size: number;
    /** 0..1 how much of the eyepiece is on screen; below `threshold` aimed, skip the picture */
    threshold = .35;
    private gl: WebGL2RenderingContext;
    private program?: WebGLProgram;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};
    private fbo: WebGLFramebuffer;
    private texture: WebGLTexture;
    private depth: WebGLRenderbuffer;
    private quad: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer };
    private saved: Int32Array | null = null;
    /** the framebuffer bound before `begin` (an offscreen pass like SSAO), bound again by `end` */
    private previous: WebGLFramebuffer | null = null;
    private viewMatrix = mat4();
    private projectionMatrix = mat4();
    private eye = { x: 0, y: 0, z: 0 };

    constructor(layer: Layer3D, readonly mount: ScopeMount, size = 768) {
        const gl = this.gl = layer.gl;
        this.size = size;
        layer.createProgram(`pw-scope-${count++}`, VERTEX, FRAGMENT).then(program => {
            this.program = program;
            for (const n of ["picture", "centre", "offset", "radius", "aspect", "pupil", "light"]) this.uniforms[n] = gl.getUniformLocation(program, n);
        });
        this.texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.depth = gl.createRenderbuffer()!;
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
        this.fbo = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const vao = gl.createVertexArray()!, buffer = gl.createBuffer()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        this.quad = { vao, buffer };
    }

    /**
     * The hold for a gun with this scope: the eye behind the eyepiece so that, aimed, the glass fills
     * `fill` of the screen height (vertical `fov` radians).
     */
    hold(hold: Hold, fov: number, fill = .8): Hold {
        const eye = this.mount.lens / (fill * Math.tan(fov / 2));
        const e = this.mount.eyepiece;
        return { ...hold, sight: [...e], front: this.mount.objective ? [...this.mount.objective] : [e[0], e[1], e[2] - this.mount.length], eye };
    }

    /** the eyepiece's apparent circle for an item -> camera matrix: centre (camera space), radius ndc y */
    private circle(item: ArrayLike<number>, projection: ArrayLike<number>) {
        const c = point(item, this.mount.eyepiece);
        const depth = Math.max(1e-3, -c[2]);
        return { c, radius: this.mount.lens / depth * projection[5], depth };
    }

    /** how much of the screen the glass covers (0..1 of the height), for `threshold` */
    coverage(item: ArrayLike<number>, projection: ArrayLike<number>) {
        return this.circle(item, projection).radius;
    }

    /**
     * Start drawing the magnified picture: binds the scope's framebuffer. Returns the view to draw the scene with
     * (eye at the objective, looking down the bore, field narrowed by `zoom`). Call `end()` after.
     */
    begin(cameraWorld: ArrayLike<number>, item: ArrayLike<number>, projection: ArrayLike<number>, near = .1, far = 4000) {
        const gl = this.gl, { radius } = this.circle(item, projection);
        // the glass subtends this half angle on screen; the picture shows it `zoom` times narrower
        const half = Math.atan(radius / projection[5]);
        perspective(this.projectionMatrix, 2 * Math.atan(Math.tan(half) / this.zoom), 1, near, far);
        // the scope's frame in the world: at the eyepiece, its axes the gun's
        const world = multiply(mat4(), cameraWorld, multiply(mat4(), item, compose(mat4(), ...this.mount.eyepiece)));
        const scale = Math.hypot(world[0], world[1], world[2]) || 1;
        for (let k = 0; k < 11; k++) if (k % 4 !== 3) world[k] /= scale;
        invertRigid(this.viewMatrix, world);
        this.eye.x = world[12]; this.eye.y = world[13]; this.eye.z = world[14];
        this.saved = gl.getParameter(gl.VIEWPORT);
        this.previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.size, this.size);
        return { viewMatrix: this.viewMatrix, projectionMatrix: this.projectionMatrix, worldPosition: this.eye, width: this.size, height: this.size };
    }

    end() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.previous);
        if (this.saved) gl.viewport(this.saved[0], this.saved[1], this.saved[2], this.saved[3]);
    }

    /**
     * The eyepiece over the screen (after the gun is drawn). `item`: the gun's item -> camera matrix,
     * `projection` the camera's, `aspect` width / height. The pupil shifts with the angle between the
     * bore and the line from the eye to the eyepiece: hold still to see through. `light` 0..1: how much of the
     * picture comes through (0 = black glass, e.g. still raising it: the picture never pops in).
     */
    overlay(item: ArrayLike<number>, projection: ArrayLike<number>, aspect: number, light = 1) {
        const gl = this.gl;
        if (!this.program) return;
        const { c, radius, depth } = this.circle(item, projection);
        const bore = direction(item, [0, 0, -1]), bl = Math.hypot(...bore);
        const along = [c[0] / depth, c[1] / depth];
        // eye off the axis -> the bright disc moves the other way, gain picked by feel
        const gain = 9;
        const offset = [(bore[0] / bl / (-bore[2] / bl) - along[0]) * gain, (bore[1] / bl / (-bore[2] / bl) - along[1]) * gain];
        gl.useProgram(this.program);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.uniforms.picture, 0);
        const ndc = [c[0] / depth * projection[0], c[1] / depth * projection[5]];
        gl.uniform2f(this.uniforms.centre, ndc[0], ndc[1]);
        gl.uniform2f(this.uniforms.offset, offset[0], offset[1]);
        gl.uniform1f(this.uniforms.radius, radius);
        gl.uniform1f(this.uniforms.aspect, aspect);
        gl.uniform1f(this.uniforms.pupil, .95);
        gl.uniform1f(this.uniforms.light, light);
        gl.bindVertexArray(this.quad.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
    }

    /** a low poly scope + rings for this mount (item space), to draw with the gun */
    mesh(colour = "#1d1f22"): Mesh {
        const m = this.mount, [x, y, z] = m.eyepiece, r = m.lens * 1.25, tube = r * .62, b = new MeshBuilder();
        const along = (from: number, length: number, radius: number, c = colour) => b.cylinder(c, { at: [x, y, z - from - length], pitch: Math.PI / 2, scale: [radius, length, radius] }, 12);
        along(0, .045, r);                       // eyepiece bell
        along(.045, .02, r * .8);
        along(.065, m.length - .13, tube);        // tube
        along(m.length - .07, .02, r * .85);
        along(m.length - .05, .05, r * 1.05);     // objective bell
        b.cylinder(colour, { at: [x, y + tube, z - m.length * .45], scale: [r * .45, r * .9, r * .45] }, 8); // turret
        b.cylinder("#2a2f3a", { at: [x, y, z - m.length - .001], pitch: Math.PI / 2, scale: [r * .9, .002, r * .9] }, 12); // glass
        for (const at of [.25, .7]) b.box(colour, { at: [x, y - tube - .012, z - m.length * at], scale: [.018, .03, .016] }); // rings
        return b.build();
    }

    destroy() {
        const gl = this.gl;
        gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.texture); gl.deleteRenderbuffer(this.depth);
        gl.deleteVertexArray(this.quad.vao); gl.deleteBuffer(this.quad.buffer);
    }
}
