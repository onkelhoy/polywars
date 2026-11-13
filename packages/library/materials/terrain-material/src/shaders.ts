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

float lightShift = 0.0; // painted ground: bends the light band edges into patch shapes
vec3 lit(vec3 albedo, vec3 n, vec3 world, float extra) {
    float d = (dot(n, normalize(sunDirection)) + wrap) * steepness + lightShift;
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
 * 3 flow 0..1 (< 0: far ground and chunk walls, smooth and plain; -2: a wall's bottom edge, lowered by `wallDrop`), 4 water surface height (ground below it is under water).
 */
/** value noise + billowy fbm 0..1 (cloud like outlines, watercolour blotches) */
const NOISE = `
float hash2f(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2f(i), hash2f(i + vec2(1, 0)), f.x), mix(hash2f(i + vec2(0, 1)), hash2f(i + vec2(1, 1)), f.x), f.y);
}
float fbmBake(vec2 p) {
    float v = 0.0, a = .5;
    for (int o = 0; o < 5; o++) { v += vnoise(p) * a; p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.3; a *= .5; }
    return v / .97;
}`;

/** baked fbm: `NOISE_SPAN` noise units over `NOISE_SIZE` texels */
export const NOISE_SPAN = 256, NOISE_SIZE = 2048;
export const NOISE_VERTEX = `#version 300 es
void main() { gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0, 1); }`;
export const NOISE_FRAGMENT = `#version 300 es
precision highp float;
${NOISE}
out vec4 outColor;
void main() { outColor = vec4(fbmBake(gl_FragCoord.xy * ${NOISE_SPAN}.0 / ${NOISE_SIZE}.0), 0, 0, 1); }`;

export const GROUND_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec4 data;
layout(location = 3) in float flow;
layout(location = 4) in float surface;
uniform mat4 view, projection;
// chunk walls: bottom edge (flow -2) hangs this many metres below the top
uniform float wallDrop;
out vec3 vWorld, vNormal;
out vec4 vData;
out float vFlow, vSurface;
flat out int vBiome;
flat out float vShade;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
    // one random shade per face: the provoking (last) vertex decides it for the whole triangle
    vec3 p = position;
    if (flow < -1.5) p.y -= wallDrop;
    vShade = hash2(floor(p.xz * 4.0) + .5);
    vWorld = p;
    vNormal = normal;
    vData = data;
    vFlow = max(flow, -1.0);
    vSurface = surface;
    vBiome = int(data.x + .5);
    gl_Position = projection * view * vec4(p, 1.0);
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
uniform highp usampler2D biomeMap;
uniform vec2 grid; // nodes per side (0: no map), metres
uniform vec3 paint; // border bleed metres (0: mesh borders), wash size metres, wash strength
uniform vec3 wash; // rim, warmth, grain
uniform float pixel; // metres per paint pixel (0: smooth)
uniform vec2 range;
uniform int debug;
${COMMON}
out vec4 outColor;

${NOISE}
uniform sampler2D noiseMap; // fbm baked once (NOISE_FRAGMENT), mirrored every NOISE_SPAN units
/** fbm from the baked texture: one fetch instead of 5 octaves of value noise (phones) */
float fbm(vec2 p) { return texture(noiseMap, p / ${NOISE_SPAN}.0).r; }
uint biomeNode(ivec2 c) { int n = int(grid.x); return texelFetch(biomeMap, clamp(c, ivec2(0), ivec2(n - 1)), 0).r; }
/** biome at a spot, borders pushed about by strokes: the biome with the most bilinear weight wins (hard edge) */
float border; // 0 at a painted biome border .. 1 well inside (set by paintedBiome)
int paintedBiome(vec2 xz, int fallback) {
    border = 1.0;
    if (grid.x < 2.0 || paint.x <= 0.0) return fallback;
    vec2 w = vec2(fbm(xz / paint.y + 3.1), fbm(xz / paint.y + 41.7)) * 2.0 - 1.0;
    vec2 g = ((xz + w * paint.x) / grid.y + .5) * (grid.x - 1.0);
    if (g.x < 0.0 || g.y < 0.0 || g.x > grid.x - 1.0 || g.y > grid.x - 1.0) return fallback;
    ivec2 i = ivec2(floor(g));
    vec2 f = fract(g);
    uint b[4] = uint[4](biomeNode(i), biomeNode(i + ivec2(1, 0)), biomeNode(i + ivec2(0, 1)), biomeNode(i + ivec2(1, 1)));
    float k[4] = float[4]((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
    uint best = b[0];
    float top = -1.0;
    for (int a = 0; a < 4; a++) {
        float sum = 0.0;
        for (int c = 0; c < 4; c++) sum += b[c] == b[a] ? k[c] : 0.0;
        if (sum > top) { top = sum; best = b[a]; }
    }
    // how far the winner leads, in screen pixels: a thin rim along the border
    float lead = (top - .5) * 2.0;
    border = top >= 1.0 ? 1.0 : smoothstep(0.0, fwidth(lead) * 3.0 + 1e-4, lead);
    return int(best);
}

vec3 ramp(float t) { return clamp(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0); }

void main() {
    vec3 face = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    // flow < 0 marks far ground and chunk walls: smooth normal, no face shades
    bool far = vFlow < 0.0;
    vec3 n = flatShade && !far ? face : normalize(vNormal);
    float slope = far ? 0.0 : 1.0 - clamp(face.y, 0.0, 1.0);
    // painting happens on a grid of pixel metre cells: one colour per cell, edges step like pixel art
    bool painted = !far && paint.z > 0.0;
    vec2 cell = painted && pixel > 0.0 ? (floor(vWorld.xz / pixel) + .5) * pixel : vWorld.xz;
    int biome = far ? vBiome : paintedBiome(cell, vBiome);
    vec3 c = palette[biome];
    if (biome > 1 && biome < ${N - 1}) {
        // painted: rock and snow edges are billowy patch edges, hard
        float jag = painted ? fbm(cell / (paint.y * .5) + 7.7) - .5 : 0.0;
        float r = painted ? step(0.0, slope - rock.x + jag * rock.y * 3.0) : smoothstep(rock.x - rock.y, rock.x + rock.y, slope);
        c = mix(c, rockColor, r);
        float s = painted ? step(0.0, vWorld.y - snow.x + jag * snow.y * 3.0) * step(slope, snow.z)
            : smoothstep(snow.x - snow.y, snow.x + snow.y, vWorld.y) * (1.0 - smoothstep(snow.z - .05, snow.z + .05, slope));
        c = mix(c, snowColor, s);
    }
    if (!far) c *= 1.0 + (vShade - .5) * 2.0 * variation;
    // patches: layered blotches, each overlap one flat colour (deeper and cooler), warm between; optional rims / grain
    if (painted) {
        float deep = 0.0, rim = 0.0;
        for (int l = 0; l < 3; l++) {
            float fl = float(l), v = fbm(cell / (paint.y * (1.0 + fl * .6)) + fl * 11.3 + float(biome) * 3.7), t = .52 + fl * .04;
            float m = step(t, v);
            deep += m;
            rim = max(rim, m * (1.0 - step(t + .03, v)));
        }
        deep /= 3.0;
        vec3 warm = vec3(1.06, 1.0, .9), cool = vec3(.9, .96, 1.04);
        c *= mix(vec3(1), mix(warm, cool, deep), wash.y);
        c *= 1.0 - paint.z * .45 * deep;
        c *= 1.0 - wash.x * .3 * max(rim, 1.0 - step(.5, border));
        lightShift = (fbm(cell / (paint.y * .4) + 23.1) - .5) * .35;
        if (wash.z > 0.0) c *= 1.0 + wash.z * .1 * (vnoise(cell * 3.1) * .6 + vnoise(cell * 9.7) * .4 - .5);
    }

    if (debug == 1) c = palette[biome];
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
    float wet = vSurface - vWorld.y;
    if (wet > 0.0 && debug == 0) {
        c = mix(c, c * underColorAt(wet) * 1.4, 1.0 - exp(-wet * .25));
    }
    vec3 shaded = debug == 0 ? lit(c, n, vWorld, 0.0) : c * (.55 + .45 * max(dot(n, normalize(sunDirection)), 0.0));
    outColor = vec4(pow(shaded, vec3(1.0 / 2.2)), 1.0);
}`;

