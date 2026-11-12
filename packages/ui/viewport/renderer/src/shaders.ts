import { SKINNING_GLSL } from "@papit/game-mesh";
import { TEXTURED_FRAGMENT_GLSL, TEXTURED_VERTEX_GLSL } from "@polywar/textured";

const vertex = (skin: boolean) => `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec4 color;
${skin ? SKINNING_GLSL : ""}
${TEXTURED_VERTEX_GLSL}
uniform mat4 model, view, projection;
out vec3 vNormal;
out vec4 vColor;
out vec3 vWorld;
void main() {
    mat4 m = model${skin ? " * skinMatrix()" : ""};
    vec4 world = m * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = mat3(m) * normal;
    vColor = color;
    texturedVertex();
    gl_Position = projection * view * world;
}`;

/**
 * Instanced static meshes: `model` is the part's model space matrix, per instance 6 `x y z scale` and 7 `yaw tint sway _`.
 * Sway bends the top along `wind.xy` (strength `wind.z`), more the higher (`swayHeight` model units = full);
 * past `fade.x` metres instances shrink away until `fade.y`.
 */
const instanced = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec4 color;
layout(location = 6) in vec4 instance;
layout(location = 7) in vec4 extra;
${TEXTURED_VERTEX_GLSL}
uniform mat4 model, view, projection;
uniform vec3 wind, eye;
uniform vec2 fade;
uniform float time, swayHeight;
uniform bool billboard;
out vec3 vNormal;
out vec4 vColor;
out vec3 vWorld;
void main() {
    vec4 local = model * vec4(position, 1.0);
    // billboard: the model's +z turns to the eye (cards), else the instance yaw
    vec2 toEye = eye.xz - instance.xz;
    float yaw = billboard ? atan(toEye.x, toEye.y) : extra.x;
    float c = cos(yaw), s = sin(yaw);
    float shrink = fade.y > 0.0 ? 1.0 - smoothstep(fade.x, fade.y, length(instance.xyz - eye)) : 1.0;
    vec3 p = local.xyz * instance.w * shrink;
    vec3 r = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
    float h = clamp(local.y / max(swayHeight, 1e-3), 0.0, 1.0);
    float phase = dot(instance.xz, vec2(.37, .21));
    r.xz += wind.xy * extra.z * wind.z * h * h * (.6 + .4 * sin(time * 1.7 + phase)) * instance.w;
    vec4 world = vec4(r + instance.xyz, 1.0);
    vWorld = world.xyz;
    vec3 n = mat3(model) * normal;
    vNormal = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
    if (billboard) vNormal = normalize(vNormal + vec3(0.0, 1.2, 0.0)); // flat cards: light them like a round crown
    vColor = color * vec4(vec3(extra.y), 1.0);
    texturedVertex();
    gl_Position = projection * view * world;
}`;

const fragment = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec4 vColor;
in vec3 vWorld;
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye, lampPosition, lampColor;
uniform float fogDensity, toon, ambient, sunStrength, lampStrength, lampRange;
uniform vec4 tint;
uniform bool unlit, mirrored;
// surface (instanced props): soft toon bands, world space grit, gloss; all 0 = off
uniform float bands, soft, grit, gloss;
uniform bool surfaced;
out vec4 outColor;
${TEXTURED_FRAGMENT_GLSL}
float hash3(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
    vec4 base = texturedColor(vColor * tint);
    // grit: a few % brightness from world space noise, so it stays put when the camera moves
    if (grit > 0.0) base.rgb *= 1.0 + grit * ((vnoise(vWorld * 1.7) * .6 + vnoise(vWorld * 6.3) * .4) * 2.0 - 1.0);
    // canvases composite premultiplied alpha
    if (unlit) { vec3 c = pow(base.rgb, vec3(1.0 / 2.2)); outColor = vec4(c * base.a, base.a); return; }
    vec3 n = texturedNormal(normalize(gl_FrontFacing != mirrored ? vNormal : -vNormal), vWorld);
    float sun = max(dot(n, normalize(sunDirection)), 0.0);
    // point lamp, smooth falloff to 0 at lampRange
    vec3 toLamp = lampPosition - vWorld;
    float fall = clamp(1.0 - length(toLamp) / max(lampRange, 1e-4), 0.0, 1.0);
    float lamp = max(dot(n, normalize(toLamp)), 0.0) * fall * fall;
    if (toon > 0.0) { sun = floor(sun * toon + 0.5) / toon; lamp = floor(lamp * toon + 0.5) / toon; }
    else if (bands > 0.0) { float x = sun * bands, f = floor(x), w = max(soft, .001) * .5; sun = (f + smoothstep(.5 - w, .5 + w, x - f)) / bands; }
    vec3 hemi = mix(ground, sky, n.y * 0.5 + 0.5) * ambient * texturedAo();
    // small view-facing highlight so dark metal still reads
    vec3 v = normalize(eye - vWorld);
    float spec = pow(max(dot(n, normalize(normalize(sunDirection) + v)), 0.0), 32.0) * 0.25 * sunStrength * texturedSpec();
    // surfaced props: matte unless glossy (no plastic sheen)
    if (surfaced) spec = 0.0;
    // gloss: a soft edged sun highlight, banded like the light
    if (gloss > 0.0) spec += smoothstep(.45, .6, pow(max(dot(n, normalize(normalize(sunDirection) + v)), 0.0), 24.0)) * gloss * sunStrength * step(0.001, sun);
    vec3 lit = base.rgb * (hemi + sunColor * sun * sunStrength + lampColor * lamp * lampStrength) + sunColor * spec;
    float d = length(vWorld - eye);
    float fog = 1.0 - exp(-d * fogDensity);
    // linear -> sRGB for the screen
    vec3 c = pow(mix(lit, fogColor, fog), vec3(1.0 / 2.2));
    outColor = vec4(c * base.a, base.a);
}`;

export const SHADERS = {
    mesh: { vertex: vertex(false), fragment },
    skin: { vertex: vertex(true), fragment },
    instanced: { vertex: instanced, fragment },
};
