import type { FogLight } from "./types";

/**
 * GLSL (after `precision`): `fogAmount(world, eye)` 0..1 and `applyFog(colour, world, eye)` (linear colour).
 * Distance fog that is thicker low down: the density falls by `exp(-fogFalloff * (y - fogBase))`, integrated along
 * the eye ray (exact for an exponential layer). `fogFalloff` 0 = plain `1 - exp(-d * fogDensity)`.
 */
export const FOG_GLSL = /* glsl */`
uniform vec3 fogColor;
uniform float fogDensity, fogFalloff, fogBase;
float fogAmount(vec3 world, vec3 eye) {
    vec3 r = world - eye;
    float d = length(r);
    if (fogFalloff <= 0.0) return 1.0 - exp(-d * fogDensity);
    float k = fogFalloff, dy = r.y;
    float at = fogDensity * exp(-k * clamp(eye.y - fogBase, -40.0 / k, 80.0 / k));
    float path = abs(k * dy) > 1e-3 ? (1.0 - exp(-clamp(k * dy, -40.0, 80.0))) / (k * dy) : 1.0;
    return 1.0 - exp(-at * d * path);
}
vec3 applyFog(vec3 c, vec3 world, vec3 eye) { return mix(c, fogColor, fogAmount(world, eye)); }
`;

/** the uniform names `FOG_GLSL` declares */
export const FOG_UNIFORMS = ["fogColor", "fogDensity", "fogFalloff", "fogBase"] as const;

/** sets `FOG_GLSL`'s uniforms; `u` finds a uniform of the bound program by name */
export function bindFog(gl: WebGL2RenderingContext, u: (name: string) => WebGLUniformLocation | null | undefined, light: FogLight) {
    gl.uniform3fv(u("fogColor") ?? null, light.fogColor);
    gl.uniform1f(u("fogDensity") ?? null, light.fogDensity);
    gl.uniform1f(u("fogFalloff") ?? null, light.fogFalloff ?? 0);
    gl.uniform1f(u("fogBase") ?? null, light.fogBase ?? 0);
}
