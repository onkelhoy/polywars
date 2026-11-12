import { UNDER_GLSL } from "@polywar/water";
import { BIOMES } from "./types";

const N = BIOMES.length;

const COMMON = `
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye;
uniform float sunStrength, ambient, fogDensity, bands, wrap, steepness;

float toon(float d) {
    if (bands <= 0.0) return clamp(d, 0.0, 1.0);
    return clamp(ceil(d * bands) / bands, 0.0, 1.0);
}

${UNDER_GLSL}
uniform bool eyeUnder;

vec3 lit(vec3 albedo, vec3 n, vec3 world, float extra) {
    float d = (dot(n, normalize(sunDirection)) + wrap) * steepness;
    vec3 hemi = mix(ground, sky, n.y * .5 + .5) * ambient;
    vec3 c = albedo * (hemi + sunColor * sunStrength * toon(d)) + sunColor * sunStrength * extra;
    float dist = length(world - eye);
    // under water the fog is the water's
    if (eyeUnder) return underFog(c, world, eye);
    return mix(c, fogColor, 1.0 - exp(-dist * fogDensity));
}
`;

/**
 * Ground attributes: 0 position, 1 normal, 2 data (biome index, slope 0..1, moisture 0..1, temperature 0..1),
 * 3 flow 0..1 (< 0: far ground and chunk walls, smooth and plain), 4 water surface height (ground below it is under water).
 */
export const GROUND_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec4 data;
layout(location = 3) in float flow;
layout(location = 4) in float surface;
uniform mat4 view, projection;
out vec3 vWorld, vNormal;
out vec4 vData;
out float vFlow, vSurface;
flat out int vBiome;
flat out float vShade;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
    // one random shade per face: the provoking (last) vertex decides it for the whole triangle
    vShade = hash2(floor(position.xz * 4.0) + .5);
    vWorld = position;
    vNormal = normal;
    vData = data;
    vFlow = flow;
    vSurface = surface;
    vBiome = int(data.x + .5);
    gl_Position = projection * view * vec4(position, 1.0);
}`;

export const GROUND_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorld, vNormal;
in vec4 vData;
in float vFlow, vSurface;
flat in int vBiome;
flat in float vShade;
uniform vec3 palette[${N}];
uniform vec3 rockColor, snowColor;
uniform vec2 rock; // slope, softness
uniform vec3 snow; // height, softness, max slope
uniform float variation, contours, seaLevel;
uniform bool flatShade;
uniform vec2 range;
uniform int debug;
${COMMON}
out vec4 outColor;

vec3 ramp(float t) { return clamp(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0); }

void main() {
    vec3 face = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    // flow < 0 marks far ground and chunk walls: smooth normal, no face shades
    bool far = vFlow < 0.0;
    vec3 n = flatShade && !far ? face : normalize(vNormal);
    float slope = far ? 0.0 : 1.0 - clamp(face.y, 0.0, 1.0);
    vec3 c = palette[vBiome];
    if (vBiome > 1 && vBiome < ${N - 1}) {
        c = mix(c, rockColor, smoothstep(rock.x - rock.y, rock.x + rock.y, slope));
        float s = smoothstep(snow.x - snow.y, snow.x + snow.y, vWorld.y) * (1.0 - smoothstep(snow.z - .05, snow.z + .05, slope));
        c = mix(c, snowColor, s);
    }
    if (!far) c *= 1.0 + (vShade - .5) * 2.0 * variation;

    if (debug == 1) c = palette[vBiome];
    else if (debug == 2) c = ramp(clamp((vWorld.y - range.x) / max(range.y - range.x, 1e-3), 0.0, 1.0));
    else if (debug == 3) c = ramp(slope);
    else if (debug == 4) c = ramp(vData.z);
    else if (debug == 5) c = ramp(vData.w);
    else if (debug == 6) c = mix(vec3(.15), vec3(.2, .5, 1), sqrt(vFlow));

    if (contours > 0.0) {
        float h = vWorld.y / contours, w = fwidth(h);
        c *= mix(.55, 1.0, smoothstep(0.0, w * 1.5, abs(fract(h + .5) - .5)));
    }
    // under water: tinted with depth
    float wet = vSurface - vWorld.y, light = 0.0;
    if (wet > 0.0 && debug == 0) {
        c = mix(c, c * underColorAt(wet) * 1.4, 1.0 - exp(-wet * .25));
    }
    vec3 shaded = debug == 0 ? lit(c, n, vWorld, light) : c * (.55 + .45 * max(dot(n, normalize(sunDirection)), 0.0));
    outColor = vec4(pow(shaded, vec3(1.0 / 2.2)), 1.0);
}`;

