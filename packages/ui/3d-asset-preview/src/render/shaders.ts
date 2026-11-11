import { SKINNING_GLSL } from "@papit/game-mesh";

const vertex = (skin: boolean) => `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec4 color;
${skin ? SKINNING_GLSL : ""}
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
uniform bool unlit;
out vec4 outColor;
void main() {
    vec4 base = vColor * tint;
    // canvases composite premultiplied alpha
    if (unlit) { vec3 c = pow(base.rgb, vec3(1.0 / 2.2)); outColor = vec4(c * base.a, base.a); return; }
    vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
    float sun = max(dot(n, normalize(sunDirection)), 0.0);
    // point lamp, smooth falloff to 0 at lampRange
    vec3 toLamp = lampPosition - vWorld;
    float fall = clamp(1.0 - length(toLamp) / max(lampRange, 1e-4), 0.0, 1.0);
    float lamp = max(dot(n, normalize(toLamp)), 0.0) * fall * fall;
    if (toon > 0.0) { sun = floor(sun * toon + 0.5) / toon; lamp = floor(lamp * toon + 0.5) / toon; }
    vec3 hemi = mix(ground, sky, n.y * 0.5 + 0.5) * ambient;
    // small view-facing highlight so dark metal still reads
    vec3 v = normalize(eye - vWorld);
    float spec = pow(max(dot(n, normalize(normalize(sunDirection) + v)), 0.0), 32.0) * 0.25 * sunStrength;
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
};
