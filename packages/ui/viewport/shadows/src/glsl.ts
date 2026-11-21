import type { ShadowSource } from "./types";

/** the texture units of the near and far maps */
export const SHADOW_UNITS = [12, 13] as const;

/**
 * GLSL (after `precision`): `shadowAt(world, normal)` 0 (lit) .. strength (in shadow). Multiply the sun term by
 * `1.0 - shadowAt(...)`. The near map where it reaches, the far one past it; one nearest sample each (crisp
 * edges), faded out with distance from the eye. Off (0) without a source.
 */
export const SHADOW_GLSL = /* glsl */`
uniform sampler2D shadowNear, shadowFar;
uniform mat4 shadowMatrix[2];
uniform vec4 shadowInfo; // on, strength, fade start, fade end
uniform vec2 shadowTexel;
uniform vec3 shadowEye;
float shadowSample(sampler2D map, mat4 m, vec3 world, float edge) {
    vec3 q = (m * vec4(world, 1.0)).xyz * .5 + .5;
    float rim = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    if (rim <= edge || q.z >= 1.0) return -1.0;
    return 1.0 - step(q.z - .0006, texture(map, q.xy).r);
}
float shadowAt(vec3 world, vec3 n) {
    if (shadowInfo.x < .5) return 0.0;
    float fade = 1.0 - smoothstep(shadowInfo.z, shadowInfo.w, length(world - shadowEye));
    if (fade <= 0.0) return 0.0;
    float s = shadowSample(shadowNear, shadowMatrix[0], world + n * shadowTexel.x * 1.5, .02);
    if (s < 0.0) s = shadowSample(shadowFar, shadowMatrix[1], world + n * shadowTexel.y * 1.5, 0.0);
    return max(s, 0.0) * shadowInfo.y * fade;
}
`;

export const SHADOW_UNIFORMS = ["shadowNear", "shadowFar", "shadowMatrix", "shadowInfo", "shadowTexel", "shadowEye"] as const;

const both = new Float32Array(32);

/** sets `SHADOW_GLSL`'s uniforms on the bound program; no source (or one being drawn) = off */
export function bindShadows(gl: WebGL2RenderingContext, u: (name: string) => WebGLUniformLocation | null | undefined, source?: ShadowSource | null) {
    const on = !!source?.maps[0] && !!source.maps[1];
    for (let i = 0; i < 2; i++)
    {
        gl.activeTexture(gl.TEXTURE0 + SHADOW_UNITS[i]);
        gl.bindTexture(gl.TEXTURE_2D, on ? source!.maps[i] : null);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u("shadowNear") ?? null, SHADOW_UNITS[0]);
    gl.uniform1i(u("shadowFar") ?? null, SHADOW_UNITS[1]);
    gl.uniform4f(u("shadowInfo") ?? null, on ? 1 : 0, source?.strength ?? 0, source?.fade[0] ?? 0, source?.fade[1] ?? 1);
    if (!on) return;
    both.set(source!.matrices[0], 0);
    both.set(source!.matrices[1], 16);
    gl.uniformMatrix4fv(u("shadowMatrix") ?? null, false, both);
    gl.uniform2f(u("shadowTexel") ?? null, source!.texels[0], source!.texels[1]);
    gl.uniform3fv(u("shadowEye") ?? null, source!.eye);
}
