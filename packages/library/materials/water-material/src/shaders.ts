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
 * Attributes: 0 position (the surface, flat), 1 info (depth metres, distance to shore metres),
 * 2 flow (u v in metres, flow speed m/s along v, open water 0..1: how many shore lines it gets).
 * Still water passes world x z as u v and speed 0.
 */
export const WATER_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec2 info;
layout(location = 2) in vec4 flow;
uniform mat4 view, projection;
out vec3 vWorld;
out vec2 vInfo;
out vec4 vFlow;

void main() {
    vWorld = position;
    vInfo = info;
    vFlow = flow;
    gl_Position = projection * view * vec4(position, 1.0);
}`;

/** Flat low poly water: depth colour, hard sun flecks, shore foam lines near the camera, river streaks. */
export const WATER_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec2 vInfo;
in vec4 vFlow;
uniform sampler2D tex;
uniform vec3 shallow, deep, foamColor, underColor;
uniform float time, opacity, clarity, skyTint;
uniform float sparkle, sparkleSize, sparkleScale, sparkleFar;
uniform float foamWidth, foamSpacing, foamSpeed, foamAmount, foamShore, foamFar;
uniform float streakAmount, streakLength, streakWidth, underDensity;
uniform bool under;
${COMMON}
out vec4 outColor;

float hard(float edge, float x) { float w = fwidth(x) + 1e-4; return smoothstep(edge - w, edge + w, x); }

void main() {
    vec3 up = vec3(0, 1, 0), toEye = eye - vWorld, v = normalize(toEye), l = normalize(sunDirection);
    float dist = length(toEye), speed = vFlow.z, river = step(.001, speed);
    vec2 uv = vFlow.xy - vec2(0, time * speed);

    // flat colour: shallow to deep, lit as a plane; a little sky at grazing angles
    float deepness = 1.0 - exp(-max(vInfo.x, 0.0) / max(clarity, .01));
    vec3 c = mix(shallow, deep, deepness) * (hemi(up) + sunColor * sunStrength * max(l.y, 0.0) * .6);
    float graze = pow(1.0 - max(v.y, 0.0), 4.0) * skyTint;
    c = mix(c, mix(ground, sky, .85) * ambient * 1.4, graze * .6);

    // sun flecks: a ripple normal from the texture, lit only past a hard threshold (no smooth glare)
    float sparkFade = 1.0 - smoothstep(sparkleFar * .4, sparkleFar, dist);
    if (sparkle > 0.0 && sparkFade > 0.0) {
        vec2 drift = vec2(time * .02, time * .013);
        vec2 r = texture(tex, uv / sparkleScale + drift).rg + texture(tex, uv / (sparkleScale * 1.37) - drift * vec2(.6, -1.3)).rg - 1.0;
        vec3 n = normalize(vec3(r.x * 3.0, 1.0, r.y * 3.0));
        float s = max(dot(reflect(-v, n), l), 0.0);
        float fleck = hard(1.0 - sparkleSize * .08, s);
        c += sunColor * sunStrength * fleck * sparkle * sparkFade;
    }

    // foam, only near the camera (from far the water is just colour)
    float near = 1.0 - smoothstep(foamFar * .5, foamFar, dist);
    float shore = vInfo.y, foam = 0.0;
    if (near > 0.0 && foamAmount > 0.0) {
        float noise = texture(tex, vWorld.xz / (foamSpacing * 3.0) + time * .004).a / 1.0;
        if (river < .5) {
            // a wobbly rim on the shore, then lines parallel to it drifting in, broken into pieces
            float rim = 1.0 - hard(foamShore * (.5 + noise), shore);
            float f = fract(shore / max(foamSpacing, .1) + time * foamSpeed + noise * .7);
            float line = hard(.9, f) * (1.0 - hard(.96, f));
            float pieces = hard(.48, texture(tex, vWorld.xz / (foamSpacing * 6.0)).a);
            line *= pieces * (1.0 - smoothstep(foamWidth * .4, foamWidth, shore)) * clamp(vFlow.w + .3, 0.0, 1.0);
            foam = max(rim, line);
        } else {
            // rivers: a thin bank line and streaks stretched along the stream, more where it runs fast
            float rim = 1.0 - hard(foamShore * .35 * (.5 + noise), shore);
            float a = texture(tex, vec2(vFlow.x / (streakWidth * 10.0), uv.y / (streakLength * 10.0))).a;
            float b = texture(tex, vec2(vFlow.x / (streakWidth * 7.0) + .5, (vFlow.y - time * speed * 1.4) / (streakLength * 7.0))).a;
            float t = 1.0 - streakAmount * .3 * clamp(speed / 2.0, .3, 1.0);
            foam = max(rim, max(hard(t, a), hard(t + .02, b)) * smoothstep(0.0, 1.5, shore));
        }
        foam *= foamAmount * near;
    }
    c = mix(c, foamColor * (hemi(up) + sunColor * sunStrength * .7), clamp(foam, 0.0, 1.0));

    float a = clamp(mix(opacity, 1.0, deepness) + graze * .3 + foam, 0.0, 1.0);
    if (under) {
        // from below: a bright, slightly see through ceiling
        c = mix(underColor, sky, .45);
        c = mix(c, underColor, 1.0 - exp(-dist * underDensity));
        a = .9;
    } else {
        c = mix(c, fogColor, 1.0 - exp(-dist * fogDensity));
    }
    outColor = vec4(pow(c, vec3(1.0 / 2.2)) * a, a);
}`;
