/** Shared: noise sampling, colour patches, toon bands, cloud shadows, fog. `noiseTex` channels: r wind, g/b patches, a clouds. */
export const COMMON_GLSL = `
#define PI 3.14159265
uniform sampler2D noiseTex;
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye;
uniform float sunStrength, ambient, fogDensity, cloudTime;
uniform vec3 grassColor;
uniform vec3 patchColor[2];
uniform vec3 patchNoise[2]; // scale, threshold, softness
uniform float bands, softBands, wrap, steepness;
uniform bool clouds;
uniform vec2 cloudDirection;
uniform float cloudScale, cloudSpeed, cloudHeight, cloudContrast, cloudThreshold, cloudMin, cloudDiverge;

vec2 rotate2(vec2 v, float degrees) {
    float a = radians(degrees), c = cos(a), s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// grass colour with the noise patches on top
vec3 patchedColor(vec2 xz) {
    vec3 c = grassColor;
    vec3 a = patchNoise[0], b = patchNoise[1];
    c = mix(c, patchColor[0], smoothstep(a.y - a.z, a.y + a.z, texture(noiseTex, xz * a.x).g));
    c = mix(c, patchColor[1], smoothstep(b.y - b.z, b.y + b.z, texture(noiseTex, xz * b.x).b));
    return c;
}

// two copies of one noise, scrolling apart: no visible repeat
float cloudLight(vec3 p) {
    vec3 l = normalize(sunDirection);
    vec2 hit = (p + (cloudHeight - p.y) / max(l.y, .05) * l).xz / cloudScale;
    vec2 d = normalize(cloudDirection + vec2(1e-4, 0));
    float a = texture(noiseTex, hit - cloudTime * cloudSpeed * rotate2(d, cloudDiverge)).a;
    float b = texture(noiseTex, hit * .8 - cloudTime * cloudSpeed * rotate2(d, -cloudDiverge) * .89 * PI / 3.0).a;
    float v = clamp(a * b + cloudThreshold, 0.0, 1.0);
    v = (v - .5) * cloudContrast + .5;
    return clamp(v + cloudThreshold, cloudMin, 1.0);
}

// hard bands, optionally softened around each threshold
float toon(float d) {
    if (bands <= 0.0) return clamp(d, 0.0, 1.0);
    float cut = 1.0 / bands;
    float stepped = clamp(ceil(d * bands) * cut, 0.0, 1.0);
    if (softBands <= 0.0) return stepped;
    float k = floor(d / cut + .5);
    if (k < 0.0 || k > bands) return stepped;
    float threshold = k * cut, half_ = .5 * cut * softBands;
    float lo = max(0.0, threshold - half_), hi = min(1.0, threshold + half_);
    float blend = hi > lo ? smoothstep(lo, hi, d) : step(threshold, d);
    return clamp(mix(threshold, min(threshold + cut, 1.0), blend), 0.0, 1.0);
}

// lit, fogged, sRGB, premultiplied
vec4 shade(vec3 albedo, vec3 n, vec3 lightAt, vec3 world) {
    float d = (dot(n, normalize(sunDirection)) + wrap) * steepness;
    if (clouds) d = min(d, cloudLight(lightAt));
    vec3 hemi = mix(ground, sky, n.y * .5 + .5) * ambient;
    vec3 lit = albedo * (hemi + sunColor * sunStrength * toon(d));
    float fog = 1.0 - exp(-length(world - eye) * fogDensity);
    return vec4(pow(mix(lit, fogColor, fog), vec3(1.0 / 2.2)), 1.0);
}
`;

export const TUFT_VERTEX = (pushers: number) => `#version 300 es
precision highp float;
precision highp int;
#define PUSHERS ${Math.max(1, pushers)}
#define PI 3.14159265
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;
layout(location = 4) in vec4 tuft; // x y z scale
uniform mat4 view, projection;
uniform int mode; // 0 sprite, 1 cross, 2 mesh
uniform float time, framerate, maxDistance;
uniform vec3 eye;
uniform bool stepped;
uniform vec2 size;
uniform vec2 windDirection;
uniform float windSpeed, windScale, windThreshold, windDiverge, windAngle;
uniform float swaySpeed, swayAngle;
uniform vec4 pushers[PUSHERS];
uniform int pusherCount;
uniform float pushAngle, pushExponent;
uniform vec2 accentChance;
uniform vec2 accentHeight, accentScale;
uniform vec4 spriteAnchor; // part of the sprite below the root, per slot (leaves, accent 1, accent 2, blades)
uniform float bladeShare;
uniform sampler2D noiseTex;
out vec2 vUv;
out vec3 vNormal, vWorld;
flat out vec3 vOrigin;
flat out int vAccent, vSlot;
flat out float vWind, vPush, vVary;
out vec3 vDebug;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 rotate2(vec2 v, float degrees) {
    float a = radians(degrees), c = cos(a), s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}
// Rodrigues, axis normalized
vec3 rotate(vec3 v, vec3 axis, float angle) {
    return v * cos(angle) + cross(axis, v) * sin(angle) + axis * dot(axis, v) * (1.0 - cos(angle));
}

void main() {
    vec3 origin = tuft.xyz;
    float seed = hash(origin.xz);
    // stepped clock with a phase per tuft, so they don't all jump on one frame
    float t = time;
    if (stepped) {
        float frame = 1.0 / framerate;
        t = floor((t + mod(seed * 10.0, frame)) * framerate + .5) / framerate;
    }

    int accent = 0;
    if (hash(origin.xz + 17.31) < accentChance.x) accent = 1;
    else if (hash(origin.xz + 41.77) < accentChance.y) accent = 2;

    vec3 p = position;
    // centred sprites pivot around their middle, lifted so the lower half stays mostly above ground
    int slot = accent > 0 ? accent : hash(origin.xz + 9.13) < bladeShare ? 3 : 0;
    float anchor = mode == 2 ? 0.0 : spriteAnchor[slot];
    p.y -= anchor;
    if (mode != 2) p.xy *= size;
    else p *= size.y;
    if (accent > 0) {
        p *= accentScale[accent - 1];
        p.y += accentHeight[accent - 1] * uv.y;
    }
    float fade = 1.0 - smoothstep(maxDistance * .8, maxDistance, length(origin - eye));
    p *= tuft.w * fade;

    // wind: two copies of one noise scrolling apart, multiplied
    vec2 d = normalize(windDirection);
    float a = texture(noiseTex, origin.xz * windScale - t * windSpeed * rotate2(d, windDiverge)).r;
    float b = texture(noiseTex, origin.xz * windScale * .8 - t * windSpeed * rotate2(d, -windDiverge) * .89 * PI / 3.0).r;
    float wind = (clamp(a * b + windThreshold, 0.0, 1.0) - .5) * 2.0;

    // own sway, random start
    float sway = sin((t + seed * 10.0) * swaySpeed * 2.0 * PI) * radians(swayAngle);

    vec3 offset, n = normal;
    if (mode == 0) {
        // camera facing, sway around the view axis
        vec3 right = vec3(view[0][0], view[1][0], view[2][0]);
        vec3 up = vec3(view[0][1], view[1][1], view[2][1]);
        vec2 q = rotate2(p.xy, degrees(sway));
        offset = right * q.x + up * q.y;
        n = vec3(0, 1, 0);
    } else {
        float spin = seed * 2.0 * PI;
        vec3 axis = vec3(cos(spin), 0, sin(spin));
        offset = rotate(rotate(p, vec3(0, 1, 0), spin), axis, sway);
        n = rotate(rotate(n, vec3(0, 1, 0), spin), axis, sway);
    }

    // push away from characters
    vec2 push = vec2(0);
    for (int i = 0; i < PUSHERS; i++) {
        if (i >= pusherCount) break;
        vec3 away = origin - pushers[i].xyz;
        float strength = pow(clamp(1.0 - length(away) / pushers[i].w, 0.0, 1.0), pushExponent);
        if (strength > 0.0 && dot(away.xz, away.xz) > 1e-6) push += normalize(away.xz) * strength;
    }
    if (length(push) > 1.0) push = normalize(push);

    vec3 windAxis = normalize(vec3(d.y, 0, -d.x));
    offset = rotate(offset, windAxis, wind * radians(windAngle));
    n = rotate(n, windAxis, wind * radians(windAngle));
    if (length(push) > 0.0) {
        vec3 pushAxis = normalize(vec3(push.y, 0, -push.x));
        offset = rotate(offset, pushAxis, length(push) * radians(pushAngle));
        n = rotate(n, pushAxis, length(push) * radians(pushAngle));
    }

    // fake perspective: how much the lean points at / away from the camera
    vec3 forward = -vec3(view[0][2], view[1][2], view[2][2]);
    vec2 f = length(forward.xz) > 1e-4 ? normalize(forward.xz) : vec2(0);
    vWind = wind * dot(f, d);
    vPush = dot(f, push);

    vec3 world = origin + offset + vec3(0, anchor * size.y * tuft.w * fade * .6, 0);
    vVary = hash(origin.xz + 3.7);
    vUv = uv;
    vNormal = n;
    vWorld = world;
    vOrigin = origin;
    vAccent = accent;
    vSlot = slot;
    vDebug = vec3(wind * .5 + .5, push * .5 + .5);
    gl_Position = projection * view * vec4(world, 1.0);
}`;

export const TUFT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
in vec3 vNormal, vWorld;
flat in vec3 vOrigin;
flat in int vAccent, vSlot;
flat in float vWind, vPush, vVary;
in vec3 vDebug;
uniform int mode, debug;
uniform float variation;
uniform float perspective;
uniform sampler2D sprite0, sprite1, sprite2, sprite3;
uniform vec4 spriteMask; // per slot, 1 = generated sprite (r shade, g accent mask)
uniform vec3 accentColor[2];
${COMMON_GLSL}
out vec4 outColor;

void main() {
    // per tuft: a little brighter or darker and a touch warmer or cooler, so tufts read apart from the ground
    float warm = fract(vVary * 7.31) - .5;
    vec3 base = patchedColor(vOrigin.xz) * (1.0 + (vVary - .5) * 2.0 * variation) * (1.0 + vec3(warm, 0, -warm) * variation);
    vec3 albedo;
    if (mode == 2) albedo = base * (.6 + .4 * clamp(vUv.y, 0.0, 1.0));
    else {
        vec2 uv = vUv;
        if (mode == 0) {
            float k = -(vWind * perspective + vPush * perspective);
            uv.x = clamp((uv.x - .5) * (uv.y * k + 1.0) + .5, 0.0, 1.0);
        }
        vec4 tex = vSlot == 1 ? texture(sprite1, uv) : vSlot == 2 ? texture(sprite2, uv) : vSlot == 3 ? texture(sprite3, uv) : texture(sprite0, uv);
        if (tex.a < .5) discard;
        float mask = spriteMask[vSlot];
        vec3 tint = vAccent > 0 ? accentColor[vAccent - 1] : base;
        albedo = mask > .5 ? mix(base, tint, tex.g) * tex.r : tex.rgb * tint;
    }
    if (debug == 1) { outColor = vec4(vec3(vDebug.x), 1); return; }
    if (debug == 2) { outColor = vec4(vDebug.y, vDebug.z, .5, 1); return; }
    // the whole tuft takes the light at its root, like one pixel-art sprite
    outColor = shade(albedo, normalize(vNormal), mode == 2 ? vWorld : vOrigin, vWorld);
}`;

export const GROUND_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
uniform mat4 view, projection;
out vec3 vWorld;
void main() {
    vWorld = position;
    gl_Position = projection * view * vec4(position, 1.0);
}`;

export const GROUND_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorld;
uniform float texel, darken;
${COMMON_GLSL}
out vec4 outColor;
void main() {
    // pixel style snaps the colour lookups to a world texel grid
    vec3 p = vWorld;
    if (texel > 0.0) p.xz = (floor(vWorld.xz / texel) + .5) * texel;
    outColor = shade(patchedColor(p.xz) * darken, vec3(0, 1, 0), p, vWorld);
}`;
