/** image urls of one material, all optional */
export type MapUrls = { albedo?: string; normal?: string; spec?: string };
/** the same on the GPU */
export type Maps = { albedo?: WebGLTexture; normal?: WebGLTexture; spec?: WebGLTexture };

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
            const t = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            const sharp = gl.getExtension("EXT_texture_filter_anisotropic");
            if (sharp) gl.texParameterf(gl.TEXTURE_2D, sharp.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(sharp.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
            gl.bindTexture(gl.TEXTURE_2D, null);
            image.close();
            return t;
        })();
        texture.catch(() => cache.textures.delete(key));
        cache.textures.set(key, texture);
    }
    return texture;
}

/** Load the maps of one material. A map that fails to load is left out. */
export async function loadMaps(gl: WebGL2RenderingContext, urls: MapUrls): Promise<Maps> {
    const one = (url: string | undefined, srgb: boolean) => url ? loadTexture(gl, url, srgb).catch(() => undefined) : undefined;
    const [albedo, normal, spec] = await Promise.all([one(urls.albedo, true), one(urls.normal, false), one(urls.spec, false)]);
    return { albedo, normal, spec };
}

/**
 * Bind `maps` (or none) for the next draw of a program that includes the textured chunks.
 * `uniforms` holds the locations of `TEXTURED_UNIFORMS`; texture units `unit` to `unit + 2` are used.
 */
export function bindMaps(gl: WebGL2RenderingContext, uniforms: Record<string, WebGLUniformLocation | null>, maps?: Maps, unit = 0) {
    const white = cacheOf(gl).white;
    const list = [maps?.albedo, maps?.normal, maps?.spec], names = ["albedoMap", "normalMap", "specMap"];
    for (let i = 0; i < 3; i++)
    {
        gl.activeTexture(gl.TEXTURE0 + unit + i);
        gl.bindTexture(gl.TEXTURE_2D, list[i] ?? white);
        gl.uniform1i(uniforms[names[i]], unit + i);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform3f(uniforms.mapsOn, list[0] ? 1 : 0, list[1] ? 1 : 0, list[2] ? 1 : 0);
}
