import type { PointLight } from "./types";

/** how many point lights a shader takes at once */
export const MAX_LIGHTS = 8;

/**
 * GLSL (fragment): `uniform vec4 lightPos[MAX_LIGHTS]` (xyz, range), `lightColor[MAX_LIGHTS]` (rgb * strength),
 * `int lightCount`; `pointLights(world, normal, toon)` sums them (diffuse, smooth falloff to 0 at range).
 */
export const LIGHTS_GLSL = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform vec4 lightPos[MAX_LIGHTS];
uniform vec4 lightColor[MAX_LIGHTS];
uniform int lightCount;
vec3 pointLights(vec3 world, vec3 n, float toon) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < MAX_LIGHTS; i++)
    {
        if (i >= lightCount) break;
        vec3 to = lightPos[i].xyz - world;
        float fall = clamp(1.0 - length(to) / max(lightPos[i].w, 1e-4), 0.0, 1.0);
        float d = max(dot(n, normalize(to)), 0.0) * fall * fall;
        if (toon > 0.0) d = floor(d * toon + 0.5) / toon;
        sum += lightColor[i].rgb * d;
    }
    return sum;
}
`;

/** a set of point lights; `pick(eye)` packs the ones that reach nearest the eye for the shader */
export class Lights {
    readonly list: PointLight[] = [];
    /** packed for `uniform4fv`: lightPos / lightColor, `count` used */
    readonly positions = new Float32Array(MAX_LIGHTS * 4);
    readonly colors = new Float32Array(MAX_LIGHTS * 4);
    count = 0;

    add(light: PointLight) { this.list.push(light); return light; }
    remove(light: PointLight) { const i = this.list.indexOf(light); if (i >= 0) this.list.splice(i, 1); }

    /** fills `positions` / `colors` / `count` with the lights closest to `eye` (by distance minus range) */
    pick(eye: ArrayLike<number>) {
        const d = (l: PointLight) => Math.hypot(l.position[0] - eye[0], l.position[1] - eye[1], l.position[2] - eye[2]) - l.range;
        const on = this.list.filter(l => l.on !== false && l.strength > 0);
        const best = on.length > MAX_LIGHTS ? on.sort((a, b) => d(a) - d(b)).slice(0, MAX_LIGHTS) : on;
        best.forEach((l, i) => {
            this.positions.set([...l.position, l.range], i * 4);
            this.colors.set([l.color[0] * l.strength, l.color[1] * l.strength, l.color[2] * l.strength, 0], i * 4);
        });
        this.count = best.length;
        return this;
    }
}

