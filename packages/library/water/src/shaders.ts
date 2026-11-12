/** Light, fog and sky shared by the water programs (same uniforms as the other polywar materials). */
const COMMON = `
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye;
uniform float sunStrength, ambient, fogDensity;
vec3 hemi(vec3 n) { return mix(ground, sky, n.y * .5 + .5) * ambient; }
`;

/** `hash2(p)` 0..1 per integer cell, `vnoise(p)` smooth value noise 0..1. No textures. */
export const NOISE_GLSL = `
float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
`;

/**
 * Caustics for any surface under water: `causticsAt(xz, time)` 0..1, thin moving light lines, procedural (no texture).
 * Paste into a fragment shader.
 */
export const CAUSTICS_GLSL = `
float causticsAt(vec2 xz, float time) {
    // three wavy sine fields; light where two of them cancel: thin crossing lines that drift
    vec2 p = xz / 1.6;
    float a = sin(p.x + sin(p.y * .8 + time * .7) * 1.3 + time * .5);
    float b = sin(p.y * 1.1 + sin(p.x * .9 - time * .6) * 1.3 - time * .4);
    float c = sin((p.x - p.y) * .7 + sin(p.x * .5 + p.y * .6 + time * .3) * 1.2 + time * .6);
    float l = max(1.0 - smoothstep(0.0, .22, abs(a + b)), 1.0 - smoothstep(0.0, .22, abs(b - c)));
    return l * .7;
}
`;

/**
 * The view under water, for any shader that has the polywar light uniforms (`sunColor`, `sunStrength`, `ambient`):
 * `underColorAt(depth)` the water's own colour that deep (shallow and sunlit near the top, dark deep down),
 * `underFog(c, world, eye)` fogs `c` with it (the eye is under a surface at `eyeSurface`). Bind with `bindUnder`.
 */
export const UNDER_GLSL = `
uniform vec3 underShallow, underDeep;
uniform float underClarity, underDensity, underSun, eyeSurface;
vec3 underColorAt(float depth) {
    depth = max(depth, 0.0);
    vec3 c = mix(underShallow, underDeep, 1.0 - exp(-depth / max(underClarity, .01)));
    return c * (ambient * .5 + sunColor * sunStrength * exp(-depth * underSun) * .9);
}
vec3 underFog(vec3 c, vec3 world, vec3 eye) {
    // the fog takes the colour of the water between eye and point: looking toward the shore it gets lighter
    float dist = length(world - eye), depth = eyeSurface - (eye.y + world.y) * .5;
    return mix(c, underColorAt(depth), 1.0 - exp(-dist * underDensity));
}
`;

/**
 * Attributes: 0 position (the surface, flat), 1 info (depth metres, distance to the shore metres, < 0 over land),
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

/** Flat low poly water: depth colour, toon dashes that glint in the sun, specks, shore foam lines near the camera, river streaks. */
export const WATER_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec2 vInfo;
in vec4 vFlow;
uniform vec3 shallow, deep, foamColor;
uniform float time, opacity, clarity, skyTint;
uniform float glintDark, glintScale, glintLength, glintLane, glintStrength, glintSpecks, glintSpeed, glintFar;
uniform float foamRim, foamWobble, foamWobbleScale, foamLines, foamWidth, foamSpacing, foamSpeed, foamAmount, foamFar;
uniform float streakAmount, streakLength, streakWidth;
uniform bool under;
${COMMON}
${NOISE_GLSL}
${UNDER_GLSL}
out vec4 outColor;

/** 0 below edge, 1 above, one pixel soft */
float hard(float edge, float x) { float w = fwidth(x) * .75 + 1e-5; return smoothstep(edge - w, edge + w, x); }
/** how visible a feature \`size\` metres wide is at this pixel: fades out once it is under a pixel */
float pixels(float size, float metresPerPixel) { return clamp(size / max(metresPerPixel, 1e-5) - .3, 0.0, 1.0); }

/** \`edge\` soft over \`px\` metres: 1 inside \`size\` */
float inside(float size, float x, float px) { return 1.0 - smoothstep(size - px * .5, size + px * .5, x); }

/** short wavy dashes along x in cells \`cell\` metres (x long, y across), \`px\` metres per pixel: 0..1 */
float dashes(vec2 p, vec2 cell, float halfLength, float thick, float keep, float seed, float px) {
    vec2 g = p / cell, id = floor(g), f = fract(g);
    float h = hash2(id + seed), h2 = hash2(id + seed + 17.0);
    vec2 m = (f - vec2(.5 + (h2 - .5) * .4, .5 + (h - .5) * .4)) * cell;
    m.y += sin(m.x / max(halfLength, .01) * 2.5 + h * 6.0) * thick * 1.2;
    float len = halfLength * (.5 + h2 * .7), taper = 1.0 - clamp(abs(m.x) / len, 0.0, 1.0);
    return inside(thick * sqrt(taper), abs(m.y), px) * step(h, keep);
}

void main() {
    vec3 up = vec3(0, 1, 0), toEye = eye - vWorld, v = normalize(toEye), l = normalize(sunDirection);
    float dist = length(toEye), speed = vFlow.z, river = step(.001, speed);
    vec2 uv = vFlow.xy - vec2(0, time * speed);

    if (under) {
        // from below: Snell's window (sky straight up), the water's own colour at grazing angles
        float window = smoothstep(.55, .72, -v.y);
        vec3 c = mix(underColorAt(.5) * 1.15, sky * 1.2 + sunColor * sunStrength * .25, window);
        c = underFog(c, vWorld, eye);
        outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
        return;
    }

    // flat colour: shallow to deep, lit as a plane; a little sky at grazing angles
    float deepness = 1.0 - exp(-max(vInfo.x, 0.0) / max(clarity, .01));
    vec3 c = mix(shallow, deep, deepness) * (hemi(up) + sunColor * sunStrength * max(l.y, 0.0) * .6);
    float graze = pow(1.0 - max(v.y, 0.0), 4.0) * skyTint;
    c = mix(c, mix(ground, sky, .85) * ambient * 1.4, graze * .6);
    vec3 white = foamColor * (hemi(up) + sunColor * sunStrength * .8);

    // toon glints: darker dashes, white inside the sun's reflection; tiny specks
    float near = 1.0 - smoothstep(glintFar * .5, glintFar, dist);
    if (near > 0.0 && (glintDark > 0.0 || glintStrength > 0.0 || glintSpecks > 0.0)) {
        // the sun's reflection: a lane narrow sideways, long toward the eye (like the sun on real water)
        vec3 rr = reflect(-v, up);
        float w = glintLane * .35 + .01, side = acos(clamp(dot(normalize(rr.xz), normalize(l.xz)), -1.0, 1.0)), tilt = abs(asin(rr.y) - asin(l.y));
        float lane = (1.0 - smoothstep(w * .6, w, side)) * (1.0 - smoothstep(w * 2.0, w * 4.0, tilt));
        // dashes lie across the wind (here: x after a turn), drifting slowly; rivers: across the stream
        vec2 p = river > .5 ? vec2(vFlow.x, uv.y).yx : mat2(.87, .5, -.5, .87) * vFlow.xy + vec2(time * glintSpeed, 0);
        float mpp = length(fwidth(vWorld.xz)), thick = glintScale * .05;
        float d = max(dashes(p, vec2(glintLength * 1.8, glintScale), glintLength * .5, thick, .75, 0.0, mpp),
                      dashes(p + glintScale * .5, vec2(glintLength * 2.3, glintScale * 1.3), glintLength * .4, thick, .6, 31.0, mpp));
        d *= pixels(thick * 2.0, mpp) * near;
        c *= 1.0 - d * glintDark * (1.0 - lane);
        c = mix(c, white * 1.3, d * lane * glintStrength);
        // specks: a few twinkling dots, more in the sun
        vec2 sp = vFlow.xy / (glintScale * 1.7), sid = floor(sp);
        float sh = hash2(sid + 5.0), r = glintScale * .035;
        vec2 sc = (fract(sp) - vec2(hash2(sid + 9.0), hash2(sid + 13.0)) * .8 - .1) * glintScale * 1.7;
        float twinkle = step(.3, fract(time * .4 + sh * 7.0));
        float speck = step(sh, glintSpecks * .3) * inside(r, length(sc), mpp) * twinkle * pixels(r * 3.0, mpp) * near;
        c = mix(c, white * 1.4, speck * (.6 + lane));
    }

    // foam, near the camera only: the rim and its lines follow the shore, made wavy by smooth noise
    float foam = 0.0, fnear = 1.0 - smoothstep(foamFar * .5, foamFar, dist);
    if (fnear > 0.0 && foamAmount > 0.0) {
        float wob = (vnoise(vWorld.xz / max(foamWobbleScale, .1) + time * .03) - .5) * 2.0 * foamWobble;
        float s = vInfo.y + wob, mpp = fwidth(s);
        if (river < .5) {
            float rim = (1.0 - hard(foamRim, s)) * pixels(foamRim, mpp);
            float phase = (s - foamRim) / max(foamSpacing, .01) + time * foamSpeed;
            float dl = abs(fract(phase + .5) - .5) * foamSpacing;
            float line = (1.0 - hard(foamWidth * .5, dl)) * pixels(foamWidth, mpp) * step(foamRim, s);
            line *= 1.0 - smoothstep(foamSpacing * foamLines * .5, foamSpacing * foamLines, s - foamRim);
            line *= hard(.42, vnoise(vWorld.xz / (foamSpacing * 2.5))) * clamp(vFlow.w + .3, 0.0, 1.0);
            foam = max(rim, line);
        } else {
            // rivers: no shore lines, white dashes running with the stream, more where it is fast
            float keep = streakAmount * .7 * clamp(speed / 2.0, .3, 1.0);
            vec2 q = vec2(uv.y, vFlow.x);
            float qpx = length(fwidth(vWorld.xz));
            float st = max(dashes(q, vec2(streakLength * 2.5, streakWidth * 4.0), streakLength * .5, streakWidth * .5, keep, 3.0, qpx),
                           dashes(q + vec2(time * speed * .4, streakWidth * 2.0), vec2(streakLength * 3.0, streakWidth * 5.0), streakLength * .4, streakWidth * .4, keep, 11.0, qpx));
            foam = (st * pixels(streakWidth, qpx) * smoothstep(0.0, streakWidth * 2.0, vInfo.y));
        }
        foam *= foamAmount * fnear;
    }
    c = mix(c, white, clamp(foam, 0.0, 1.0));

    float a = clamp(mix(opacity, 1.0, deepness) + graze * .3 + foam, 0.0, 1.0);
    c = mix(c, fogColor, 1.0 - exp(-dist * fogDensity));
    outColor = vec4(pow(c, vec3(1.0 / 2.2)) * a, a);
}`;
