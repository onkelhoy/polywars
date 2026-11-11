/**
 * Vertex chunk: the uv attribute (game-mesh location 3) and its varying.
 * Call `texturedVertex()` in `main`.
 */
export const TEXTURED_VERTEX_GLSL = `
layout(location = 3) in vec2 uv;
out vec2 vUv;
void texturedVertex() { vUv = uv; }
`;

/**
 * Fragment chunk. Every map is optional (`mapsOn` says which are bound, see `bindMaps`):
 * - `texturedColor(base)`: base colour (linear) times the albedo map
 * - `texturedNormal(n, world)`: unit world normal bent by the normal map (OpenGL, +Y up). The tangent
 *   frame comes from screen derivatives, so meshes need uvs but no tangents; mirrored uvs work.
 * - `texturedSpec()`: highlight strength, 1 without a map
 */
export const TEXTURED_FRAGMENT_GLSL = `
in vec2 vUv;
uniform sampler2D albedoMap, normalMap, specMap;
uniform vec3 mapsOn;
vec4 texturedColor(vec4 base) {
    return mapsOn.x > 0.5 ? base * texture(albedoMap, vUv) : base;
}
vec3 texturedNormal(vec3 n, vec3 world) {
    if (mapsOn.y < 0.5) return n;
    vec3 t = texture(normalMap, vUv).xyz * 2.0 - 1.0;
    t.y = -t.y; // uv v runs down the image, the map's +Y runs up
    vec3 dpx = dFdx(world), dpy = dFdy(world);
    vec2 dux = dFdx(vUv), duy = dFdy(vUv);
    vec3 perp2 = cross(dpy, n), perp1 = cross(n, dpx);
    vec3 T = perp2 * dux.x + perp1 * duy.x;
    vec3 B = perp2 * dux.y + perp1 * duy.y;
    float len = max(dot(T, T), dot(B, B));
    if (len < 1e-20) return n;
    float inv = inversesqrt(len);
    return normalize(mat3(T * inv, B * inv, n) * t);
}
float texturedSpec() {
    return mapsOn.z > 0.5 ? texture(specMap, vUv).r : 1.0;
}
`;

/** uniform names of the chunks, for `gl.getUniformLocation` */
export const TEXTURED_UNIFORMS = ["albedoMap", "normalMap", "specMap", "mapsOn"] as const;
