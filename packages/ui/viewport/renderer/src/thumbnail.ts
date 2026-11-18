import { Matrix4 } from "@papit/matrix";
import type { Model } from "./model";
import type { Renderer } from "./renderer";

export type ThumbnailOptions = { width?: number; height?: number; /** world units of margin round the model, as a share of its size */ margin?: number };

/**
 * A side view (from +x, -z to the right) of `model` as a PNG data url, drawn with `renderer` into its own framebuffer
 * (the bound framebuffer and viewport come back after). Transparent round the model.
 */
export function thumbnail(renderer: Renderer, model: Model, options: ThumbnailOptions = {}): string {
    const gl = renderer.gl, w = options.width ?? 256, h = options.height ?? 128, margin = 1 + (options.margin ?? .08);
    const { min, max } = model.bounds, c = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
    const lz = (max[2] - min[2]) / 2 * margin, ly = (max[1] - min[1]) / 2 * margin;
    const hh = Math.max(ly, lz * h / w, 1e-3), hw = hh * w / h, d = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) + 1, far = d * 2;
    // world -> camera: camera looks along -x, its right is world -z
    const viewMatrix = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, c[2], -c[1], -c[0] - d, 1]);
    const projectionMatrix = new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -2 / far, 0, 0, 0, -1, 1]);

    const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING), prevView = gl.getParameter(gl.VIEWPORT) as Int32Array;
    const tex = gl.createTexture(), depth = gl.createRenderbuffer(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.viewport(0, 0, w, h);
    renderer.begin({ viewMatrix, projectionMatrix, worldPosition: { x: c[0] + d, y: c[1], z: c[2] } }, [0, 0, 0, 0]);
    model.draw(renderer, Matrix4.create());
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb);
    gl.viewport(prevView[0], prevView[1], prevView[2], prevView[3]);
    gl.deleteFramebuffer(fb); gl.deleteTexture(tex); gl.deleteRenderbuffer(depth);

    // flip rows, undo premultiplied alpha
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!, image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
        {
            const s = ((h - 1 - y) * w + x) * 4, t = (y * w + x) * 4, a = pixels[s + 3] / 255 || 1;
            image.data[t] = pixels[s] / a; image.data[t + 1] = pixels[s + 1] / a; image.data[t + 2] = pixels[s + 2] / a; image.data[t + 3] = pixels[s + 3];
        }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL();
}
