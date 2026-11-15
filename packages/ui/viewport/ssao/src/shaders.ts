/** one triangle over the screen, no buffers (gl_VertexID) */
const FULLSCREEN = /* glsl */ `#version 300 es
out vec2 uv;
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    uv = p;
    gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

/** view space point of a depth texel, by the inverse projection (perspective and orthographic alike) */
const VIEW = /* glsl */ `
vec3 viewAt(vec2 at, float d) {
    vec4 v = inverseProjection * vec4(at * 2. - 1., d * 2. - 1., 1.);
    return v.xyz / v.w;
}`;

/**
 * Half res AO: normal from the depth neighbours (the nearer side, so edges stay sharp), a hemisphere kernel turned
 * by a 4x4 tile of angles (the blur's 4x4 box takes it out again), range checked so far walls don't darken.
 */
const AO = /* glsl */ `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform highp sampler2D depth;
uniform mat4 projection, inverseProjection;
uniform vec3 kernel[16];
uniform int samples;
uniform float radius, bias, power;
uniform vec2 texel, fade;
${VIEW}
// depth is NEAREST: read and place each point at a texel centre, else steep depth (floors far off) gets bands
vec2 snap(vec2 p) { return (floor(p / texel) + .5) * texel; }
vec3 at(vec2 p) { p = snap(p); return viewAt(p, texture(depth, p).r); }
void main() {
    vec2 c = snap(uv);
    float d = texture(depth, c).r;
    if (d >= 1.) { color = vec4(1.); return; }
    vec3 p = viewAt(c, d);
    vec3 l = at(c - vec2(texel.x, 0.)), r = at(c + vec2(texel.x, 0.)), b = at(c - vec2(0., texel.y)), t = at(c + vec2(0., texel.y));
    vec3 dx = abs(r.z - p.z) < abs(p.z - l.z) ? r - p : p - l;
    vec3 dy = abs(t.z - p.z) < abs(p.z - b.z) ? t - p : p - b;
    vec3 n = normalize(cross(dx, dy));
    if (dot(n, p) > 0.) n = -n;
    ivec2 cell = ivec2(gl_FragCoord.xy) & 3;
    float a = fract(float(cell.x + cell.y * 4) * .61803398875) * 6.2831853;
    vec3 rv = vec3(cos(a), sin(a), 0.);
    vec3 tg = rv - n * dot(rv, n);
    tg = length(tg) < 1e-3 ? normalize(cross(n, vec3(0., 1., 0.)) + 1e-4) : normalize(tg);
    mat3 tbn = mat3(tg, cross(n, tg), n);
    float occlusion = 0.;
    for (int i = 0; i < 16; i++) {
        if (i >= samples) break;
        vec3 s = p + tbn * kernel[i] * radius;
        vec4 c = projection * vec4(s, 1.);
        vec2 q = c.xy / c.w * .5 + .5;
        if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) continue;
        float z = at(q).z;
        float range = smoothstep(0., 1., radius / abs(p.z - z));
        occlusion += (z >= s.z + bias ? 1. : 0.) * range;
    }
    float ao = pow(clamp(1. - occlusion / float(samples), 0., 1.), power);
    color = vec4(vec3(mix(ao, 1., smoothstep(fade.x, fade.y, -p.z))), 1.);
}`;

/** Full res: the AO 4x4 box blurred by depth (no halos over edges), times the frame; writes the depth back too. */
const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D scene, ao;
uniform highp sampler2D depth;
uniform mat4 inverseProjection;
uniform vec2 aoTexel;
uniform float strength;
uniform int debug;
${VIEW}
void main() {
    float d = texture(depth, uv).r;
    vec4 c = texture(scene, uv);
    gl_FragDepth = d;
    float z = viewAt(uv, d).z, sum = 0., weight = 0.;
    for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) {
        vec2 q = uv + (vec2(x, y) + .5) * aoTexel;
        float dz = abs(viewAt(q, texture(depth, q).r).z - z);
        float w = max(0., 1. - dz / (.05 * abs(z) + .05)) + 1e-4;
        sum += texture(ao, q).r * w;
        weight += w;
    }
    float o = d >= 1. ? 1. : mix(1., sum / weight, strength);
    color = debug == 1 ? vec4(vec3(o), 1.) : vec4(c.rgb * o, c.a);
}`;

export const SHADERS = {
    ao: { vertex: FULLSCREEN, fragment: AO },
    composite: { vertex: FULLSCREEN, fragment: COMPOSITE },
};
