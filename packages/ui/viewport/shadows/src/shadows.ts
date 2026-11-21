import type { ShadowSource, ShadowsOptions, Vec3, View } from "./types";

type Level = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; matrix: Float32Array; view: Float32Array; projection: Float32Array; drawn: boolean };

/**
 * Toon sun shadows in two levels round the camera: a sharp near map and a coarser far one, faded out with distance
 * (nothing strong far off). Each square moves in whole texels, so the shadow edges don't crawl while walking.
 *
 * `cast(camera, sun, draw)`: `draw(view)` draws every caster with `view` as its camera (depth only, colour off),
 * once per level redrawn; the bound framebuffer + viewport come back after. Set it as `light.shadow` for the materials.
 */
export class Shadows implements ShadowSource {
    readonly size: number;
    radius: [number, number];
    strength: number;
    fade: [number, number];
    height: number;
    farEvery: number;
    readonly eye: Vec3 = [0, 0, 0];
    private levels: [Level, Level];
    private drawing = false;
    private frame = 0;

    constructor(readonly gl: WebGL2RenderingContext, options: ShadowsOptions = {}) {
        this.size = options.size ?? 1024;
        this.radius = options.radius ?? [12, 45];
        this.strength = options.strength ?? .45;
        this.fade = options.fade ?? [20, 45];
        this.height = options.height ?? 120;
        this.farEvery = options.farEvery ?? 2;
        this.levels = [this.level(), this.level()];
    }

    get maps(): [WebGLTexture | null, WebGLTexture | null] {
        const ok = !this.drawing && this.levels[0].drawn && this.levels[1].drawn;
        return [ok ? this.levels[0].texture : null, ok ? this.levels[1].texture : null];
    }
    get matrices(): [Float32Array, Float32Array] { return [this.levels[0].matrix, this.levels[1].matrix]; }
    get texels(): [number, number] { return [this.radius[0] * 2 / this.size, this.radius[1] * 2 / this.size]; }

    /** draws the casters into the maps: the squares round `camera`, the sun shining from `sun` (toward the sun) */
    cast(camera: View, sun: ArrayLike<number>, draw: (view: View) => void) {
        const gl = this.gl, e = camera.worldPosition ?? { x: 0, y: 0, z: 0 };
        this.eye[0] = e.x; this.eye[1] = e.y; this.eye[2] = e.z;
        const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING), viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
        this.drawing = true;
        gl.colorMask(false, false, false, false);
        gl.depthMask(true);
        gl.viewport(0, 0, this.size, this.size);
        const far = this.frame++ % Math.max(1, this.farEvery) === 0 || !this.levels[1].drawn;
        for (const i of far ? [0, 1] : [0])
        {
            const l = this.levels[i];
            this.place(l, camera, sun, this.radius[i]);
            gl.bindFramebuffer(gl.FRAMEBUFFER, l.framebuffer);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            const eye = this.sunEye;
            draw({ viewMatrix: l.view, projectionMatrix: l.projection, worldPosition: { x: eye[0], y: eye[1], z: eye[2] } });
            l.drawn = true;
        }
        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
        this.drawing = false;
    }

    destroy() {
        for (const l of this.levels) { this.gl.deleteFramebuffer(l.framebuffer); this.gl.deleteTexture(l.texture); }
    }

    private sunEye: Vec3 = [0, 0, 0];

    /** the level's square: round the camera (a little ahead), moved in whole texels across the sun's view */
    private place(l: Level, camera: View, sun: ArrayLike<number>, r: number) {
        const texel = r * 2 / this.size;
        const z = unit([sun[0], sun[1], sun[2]]);
        const x = unit(Math.abs(z[1]) > .99 ? cross([1, 0, 0], z) : cross([0, 1, 0], z)), y = cross(z, x);
        const v = camera.viewMatrix, ahead = unit([-v[2], 0, -v[10]]), k = r * .4;
        const c: Vec3 = [this.eye[0] + ahead[0] * k, this.eye[1], this.eye[2] + ahead[2] * k];
        const cx = dot(c, x), cy = dot(c, y), sx = Math.round(cx / texel) * texel - cx, sy = Math.round(cy / texel) * texel - cy;
        for (let i = 0; i < 3; i++) c[i] += x[i] * sx + y[i] * sy;
        const eye = this.sunEye;
        for (let i = 0; i < 3; i++) eye[i] = c[i] + z[i] * this.height;
        l.view.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
        const far = this.height * 2 + 40;
        l.projection.set([1 / r, 0, 0, 0, 0, 1 / r, 0, 0, 0, 0, -2 / far, 0, 0, 0, -1, 1]);
        multiply(l.matrix, l.projection, l.view);
    }

    private level(): Level {
        const gl = this.gl, texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.size, this.size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        const framebuffer = gl.createFramebuffer()!, before = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, before);
        return { texture, framebuffer, matrix: new Float32Array(16), view: new Float32Array(16), projection: new Float32Array(16), drawn: false };
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
