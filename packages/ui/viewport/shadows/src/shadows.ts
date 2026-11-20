import type { ShadowSource, ShadowsOptions, Vec3, View } from "./types";

/**
 * Toon sun shadows: one depth map over a square round the camera (a bit ahead of it), seen from the sun.
 * The square moves in whole texels, so the blocky shadow pixels stay put while walking.
 *
 * `cast(camera, sun, draw)`: `draw(view)` draws every caster with `view` as its camera (depth only, colour off);
 * the bound framebuffer + viewport come back after. Then set it as `light.shadow` for the materials.
 */
export class Shadows implements ShadowSource {
    readonly matrix = new Float32Array(16);
    readonly size: number;
    radius: number;
    strength: number;
    height: number;
    private texture: WebGLTexture;
    private framebuffer: WebGLFramebuffer;
    private drawing = false;
    private drawn = false;
    private viewMatrix = new Float32Array(16);
    private projectionMatrix = new Float32Array(16);

    constructor(readonly gl: WebGL2RenderingContext, options: ShadowsOptions = {}) {
        this.size = options.size ?? 512;
        this.radius = options.radius ?? 45;
        this.strength = options.strength ?? .55;
        this.height = options.height ?? 120;
        const t = this.texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.size, this.size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this.framebuffer = gl.createFramebuffer()!;
        const before = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, before);
    }

    get map() { return this.drawing || !this.drawn ? null : this.texture; }
    get texel() { return this.radius * 2 / this.size; }

    /** draws the casters into the map: the square round `camera`, the sun shining from `sun` (toward the sun) */
    cast(camera: View, sun: ArrayLike<number>, draw: (view: View) => void) {
        const gl = this.gl, r = this.radius, texel = this.texel;
        const z = unit([sun[0], sun[1], sun[2]]);
        const x = unit(Math.abs(z[1]) > .99 ? cross([1, 0, 0], z) : cross([0, 1, 0], z)), y = cross(z, x);
        // centre: ahead of the camera on the ground plane, moved in whole texels across the sun's view
        const e = camera.worldPosition ?? { x: 0, y: 0, z: 0 }, v = camera.viewMatrix;
        const ahead = unit([-v[2], 0, -v[10]]), k = r * .45;
        const c: Vec3 = [e.x + ahead[0] * k, e.y, e.z + ahead[2] * k];
        const cx = dot(c, x), cy = dot(c, y), sx = Math.round(cx / texel) * texel - cx, sy = Math.round(cy / texel) * texel - cy;
        for (let i = 0; i < 3; i++) c[i] += x[i] * sx + y[i] * sy;
        const eye: Vec3 = [c[0] + z[0] * this.height, c[1] + z[1] * this.height, c[2] + z[2] * this.height];
        const m = this.viewMatrix;
        m.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
        const near = 0, far = this.height * 2 + 40, p = this.projectionMatrix;
        p.set([1 / r, 0, 0, 0, 0, 1 / r, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]);
        multiply(this.matrix, p, m);

        const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING), viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
        this.drawing = true;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.size, this.size);
        gl.colorMask(false, false, false, false);
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        draw({ viewMatrix: m, projectionMatrix: p, worldPosition: { x: eye[0], y: eye[1], z: eye[2] } });
        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
        this.drawing = false;
        this.drawn = true;
    }

    destroy() {
        this.gl.deleteFramebuffer(this.framebuffer);
        this.gl.deleteTexture(this.texture);
    }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** out = a * b (column major 4x4) */
function multiply(out: Float32Array, a: Float32Array, b: Float32Array) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
}
