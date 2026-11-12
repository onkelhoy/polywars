/** Light, fog and sky shared by the water programs (same uniforms as the other polywar materials). */
const COMMON = `
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye;
uniform float sunStrength, ambient, fogDensity;
vec3 hemi(vec3 n) { return mix(ground, sky, n.y * .5 + .5) * ambient; }
`;

/**
 * Caustics for any surface under water: `causticsAt(tex, xz, time)` 0..1, two scrolling layers of the water texture's b channel.
 * Paste into a fragment shader that has the water texture bound.
 */
export const CAUSTICS_GLSL = `
float causticsAt(sampler2D tex, vec2 xz, float time) {
    float a = texture(tex, xz / 9.0 + vec2(time * .021, time * .013)).b;
    float b = texture(tex, xz / 7.0 - vec2(time * .017, -time * .024)).b;
    return min(a, b) * 2.0;
}
`;

/**
 * Attributes: 0 position (the still surface), 1 info (depth metres, distance to shore metres),
 * 2 flow (u v in metres for the ripples, flow speed m/s along v, wave scale 0..1).
 * Still water passes world x z as u v and speed 0.
 */
export const WATER_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec2 info;
layout(location = 2) in vec4 flow;
uniform mat4 view, projection;
uniform float time, waveSpeed;
uniform vec4 waves[4]; // dir x, dir z, steepness, wavelength
out vec3 vWorld, vNormal;
out vec2 vInfo;
out vec4 vFlow;

void main() {
    vec3 p = position, tangent = vec3(1, 0, 0), binormal = vec3(0, 0, 1);
    // no swell right at the shore (the ground stays sealed) nor where the mesh says none
    float amp = flow.w * smoothstep(0.0, 8.0, info.y);
    for (int i = 0; i < 4; i++) {
        vec4 w = waves[i];
        float k = 6.28318 / w.w, c = sqrt(9.8 / k), s = w.z * amp;
        vec2 d = normalize(w.xy);
        float f = k * (dot(d, position.xz) - c * time * waveSpeed), a = s / k;
        p += vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
        tangent += vec3(-d.x * d.x * s * sin(f), d.x * s * cos(f), -d.x * d.y * s * sin(f));
        binormal += vec3(-d.x * d.y * s * sin(f), d.y * s * cos(f), -d.y * d.y * s * sin(f));
    }
    vWorld = p;
    vNormal = normalize(cross(binormal, tangent));
    vInfo = info;
    vFlow = flow;
    gl_Position = projection * view * vec4(p, 1.0);
}`;

export const WATER_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld, vNormal;
in vec2 vInfo;
in vec4 vFlow;
uniform sampler2D tex;
uniform vec3 shallow, deep, foamColor, underColor;
uniform float time, opacity, clarity, gloss, shininess, fresnel, glossBands;
uniform float rippleScale, rippleStrength, rippleSpeed, rippleNear, rippleFar;
uniform float foamWidth, foamSpacing, foamSpeed, foamAmount, foamShore, underDensity;
uniform bool flatShade, under;
${COMMON}
out vec4 outColor;

void main() {
    vec3 face = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (face.y < 0.0) face = -face;
    vec3 n = flatShade ? face : normalize(vNormal);
    float dist = length(eye - vWorld);

    // ripples: two layers drifting apart; rivers scroll them downstream
    vec2 uv = vFlow.xy - vec2(0, time * vFlow.z);
    vec2 drift = time * rippleSpeed * vec2(.03, .02);
    vec2 r = (texture(tex, uv / rippleScale + drift).rg - .5) + (texture(tex, uv / (rippleScale * 1.7) - drift * vec2(.7, -1.6)).rg - .5);
    n = normalize(n + vec3(r.x, 0, r.y) * 2.0 * rippleStrength * (1.0 - smoothstep(rippleNear, rippleFar, dist)));

    vec3 v = normalize(eye - vWorld), l = normalize(sunDirection);
    float deepness = 1.0 - exp(-max(vInfo.x, 0.0) / max(clarity, .01));
    vec3 base = mix(shallow, deep, deepness);
    vec3 c = base * (hemi(n) + sunColor * sunStrength * max(dot(n, l), 0.0) * .6);
    // sky in the surface, stronger at grazing angles
    float fres = fresnel + (1.0 - fresnel) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 r3 = reflect(-v, n);
    c = mix(c, mix(ground, sky, clamp(r3.y * .5 + .6, 0.0, 1.0)), fres * .8);
    float spec = pow(max(dot(n, normalize(l + v)), 0.0), shininess);
    if (glossBands > 0.0) spec = smoothstep(.5 - .5 / glossBands, .5, spec);
    c += sunColor * sunStrength * spec * gloss;

    // foam: lines running in to the shore, broken up by noise, and a steady rim on the edge
    float shore = vInfo.y, noise = texture(tex, vWorld.xz / (foamSpacing * 4.0) + time * .01).a;
    float phase = shore / max(foamSpacing, .1) + time * foamSpeed + noise * .8;
    float line = smoothstep(.82, .97, 1.0 - abs(fract(phase) * 2.0 - 1.0));
    float foam = line * (1.0 - smoothstep(foamWidth * .3, foamWidth, shore)) * smoothstep(.25, .55, noise) * vFlow.w;
    foam = max(foam, (1.0 - smoothstep(foamShore * .4, foamShore, shore)) * smoothstep(.3, .5, noise));
    foam *= foamAmount;
    c = mix(c, foamColor * (hemi(vec3(0, 1, 0)) + sunColor * sunStrength * .7), clamp(foam, 0.0, 1.0));

    float a = clamp(mix(opacity, 1.0, deepness) + fres * .25 + foam, 0.0, 1.0);
    if (under) {
        // from below: the surface is a bright, slightly see through ceiling
        c = mix(underColor, sky, .35 + .3 * pow(max(-n.y * -1.0, 0.0), 2.0));
        float fogU = 1.0 - exp(-dist * underDensity);
        c = mix(c, underColor, fogU);
        a = .9;
    } else {
        float fog = 1.0 - exp(-dist * fogDensity);
        c = mix(c, fogColor, fog);
    }
    outColor = vec4(pow(c, vec3(1.0 / 2.2)) * a, a);
}`;
