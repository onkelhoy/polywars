import type { ShadowSource } from "./types";

/** the texture unit the shadow map is bound to */
export const SHADOW_UNIT = 12;

/**
 * GLSL (after `precision`): `shadowAt(world, normal)` 0 (lit) .. `strength` (in shadow). Multiply the sun term by
 * `1.0 - shadowAt(...)`. One nearest sample: hard, pixel edged shadows. Off (0) without a source.
 */
export const SHADOW_GLSL = /* glsl */`
uniform sampler2D shadowMap;
uniform mat4 shadowMatrix;
uniform vec3 shadowInfo; // on, strength, texel (m)
float shadowAt(vec3 world, vec3 n) {
    if (shadowInfo.x < .5) return 0.0;
    vec4 p = shadowMatrix * vec4(world + n * shadowInfo.z * 1.5, 1.0);
    vec3 q = p.xyz * .5 + .5;
    if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0 || q.z >= 1.0) return 0.0;
    float lit = step(q.z - .0008, texture(shadowMap, q.xy).r);
    // gone toward the square's rim, so its edge never shows
    float rim = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    return (1.0 - lit) * shadowInfo.y * smoothstep(0.0, .12, rim);
}
`;

export const SHADOW_UNIFORMS = ["shadowMap", "shadowMatrix", "shadowInfo"] as const;

/** sets `SHADOW_GLSL`'s uniforms on the bound program; no source (or one being drawn) = off */
export function bindShadows(gl: WebGL2RenderingContext, u: (name: string) => WebGLUniformLocation | null | undefined, source?: ShadowSource | null) {
    const on = !!source?.map;
    gl.activeTexture(gl.TEXTURE0 + SHADOW_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, on ? source!.map : null);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u("shadowMap") ?? null, SHADOW_UNIT);
    if (on) gl.uniformMatrix4fv(u("shadowMatrix") ?? null, false, source!.matrix);
    gl.uniform3f(u("shadowInfo") ?? null, on ? 1 : 0, source?.strength ?? 0, source?.texel ?? 0);
}
