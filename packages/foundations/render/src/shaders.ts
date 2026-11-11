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
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye;
uniform float fogDensity, toon;
uniform vec4 tint;
uniform bool unlit;
out vec4 outColor;
void main() {
    vec4 base = vColor * tint;
    // canvases composite premultiplied alpha
    if (unlit) { outColor = vec4(base.rgb * base.a, base.a); return; }
    vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
    float sun = max(dot(n, normalize(sunDirection)), 0.0);
    if (toon > 0.0) sun = floor(sun * toon + 0.5) / toon;
    vec3 hemi = mix(ground, sky, n.y * 0.5 + 0.5);
    vec3 lit = base.rgb * (hemi + sunColor * sun);
    float d = length(vWorld - eye);
    float fog = 1.0 - exp(-d * fogDensity);
    outColor = vec4(mix(lit, fogColor, fog) * base.a, base.a);
}`;

export const SHADERS = {
    mesh: { vertex: vertex(false), fragment },
    skin: { vertex: vertex(true), fragment },
};
