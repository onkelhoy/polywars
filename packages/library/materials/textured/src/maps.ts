/** raw 8 bit pixels, rows top to bottom, `channels` 1 (grey), 3 (rgb) or 4 (rgba) */
export type MapPixels = { pixels: Uint8Array; width: number; height: number; channels: 1 | 3 | 4 };
/** one map: an image url or raw pixels (in-memory, e.g. a fresh bake) */
export type MapSource = string | MapPixels;
/** the maps of one material, all optional */
export type MapUrls = { albedo?: MapSource; normal?: MapSource; spec?: MapSource; ao?: MapSource };
/** the same on the GPU */
export type Maps = { albedo?: WebGLTexture; normal?: WebGLTexture; spec?: WebGLTexture; ao?: WebGLTexture };

type Cache = { textures: Map<string, Promise<WebGLTexture>>; white: WebGLTexture };
const caches = new WeakMap<WebGL2RenderingContext, Cache>();

function cacheOf(gl: WebGL2RenderingContext) {
    let cache = caches.get(gl);
    if (!cache)
    {
        const white = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, white);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        caches.set(gl, cache = { textures: new Map(), white });
    }
    return cache;
}

function upload(gl: WebGL2RenderingContext, srgb: boolean, image: () => void) {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    image();
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const sharp = gl.getExtension("EXT_texture_filter_anisotropic");
    if (sharp) gl.texParameterf(gl.TEXTURE_2D, sharp.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(sharp.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.bindTexture(gl.TEXTURE_2D, null);
    return t;
}

/**
 * A texture from raw 8 bit pixels, rows top to bottom: `channels` 1 (grey), 3 (rgb) or 4 (rgba).
 * Not cached: `gl.deleteTexture` it when done.
 */
export function textureFrom(gl: WebGL2RenderingContext, pixels: Uint8Array, width: number, height: number, channels: 1 | 3 | 4, srgb = false): WebGLTexture {
    let rgba = pixels;
    if (channels !== 4)
    {
        rgba = new Uint8Array(width * height * 4);
        for (let i = 0; i < width * height; i++)
        {
            rgba[i * 4] = pixels[i * channels];
            rgba[i * 4 + 1] = pixels[i * channels + (channels === 3 ? 1 : 0)];
            rgba[i * 4 + 2] = pixels[i * channels + (channels === 3 ? 2 : 0)];
            rgba[i * 4 + 3] = 255;
        }
    }
    return upload(gl, srgb, () => gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba));
}

/**
 * One image as a repeating, mipmapped texture; the same url is loaded once per context.
 * `srgb` for colour (albedo): the shader then reads linear values. Normal and spec maps are data, keep it off.
 */
export function loadTexture(gl: WebGL2RenderingContext, url: string, srgb = false): Promise<WebGLTexture> {
    const cache = cacheOf(gl), key = `${srgb ? "s" : "l"}|${url}`;
    let texture = cache.textures.get(key);
    if (!texture)
    {
        texture = (async () => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`textured: ${url} ${response.status}`);
            const image = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
            const t = upload(gl, srgb, () => gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image));
            image.close();
            return t;
        })();
        texture.catch(() => cache.textures.delete(key));
        cache.textures.set(key, texture);
    }
    return texture;
}

/**
 * Load the maps of one material. A map that fails to load is left out.
 * Urls are cached per context; textures from pixels are new (`gl.deleteTexture` them when done).
 */
export async function loadMaps(gl: WebGL2RenderingContext, urls: MapUrls): Promise<Maps> {
    const one = (source: MapSource | undefined, srgb: boolean) => !source ? undefined
        : typeof source === "string" ? loadTexture(gl, source, srgb).catch(() => undefined)
        : textureFrom(gl, source.pixels, source.width, source.height, source.channels, srgb);
    const [albedo, normal, spec, ao] = await Promise.all([one(urls.albedo, true), one(urls.normal, false), one(urls.spec, false), one(urls.ao, false)]);
    return { albedo, normal, spec, ao };
}

/**
 * Bind `maps` (or none) for the next draw of a program that includes the textured chunks.
 * `uniforms` holds the locations of `TEXTURED_UNIFORMS`; texture units `unit` to `unit + 3` are used.
 */
export function bindMaps(gl: WebGL2RenderingContext, uniforms: Record<string, WebGLUniformLocation | null>, maps?: Maps, unit = 0) {
    const white = cacheOf(gl).white;
    const list = [maps?.albedo, maps?.normal, maps?.spec, maps?.ao], names = ["albedoMap", "normalMap", "specMap", "aoMap"];
    for (let i = 0; i < 4; i++)
    {
        gl.activeTexture(gl.TEXTURE0 + unit + i);
        gl.bindTexture(gl.TEXTURE_2D, list[i] ?? white);
        gl.uniform1i(uniforms[names[i]], unit + i);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4f(uniforms.mapsOn, list[0] ? 1 : 0, list[1] ? 1 : 0, list[2] ? 1 : 0, list[3] ? 1 : 0);
}
