/** Light, fog and sky shared by the water programs (same uniforms as the other polywar materials). */
const COMMON = `
uniform vec3 sunDirection, sunColor, sky, ground, fogColor, eye;
uniform float sunStrength, ambient, fogDensity;
vec3 hemi(vec3 n) { return mix(ground, sky, n.y * .5 + .5) * ambient; }
`;

/** `hash2(p)` 0..1 per integer cell, `vnoise(p)` smooth value noise 0..1, `fbm3(p)` three octaves of it. No textures. */
export const NOISE_GLSL = `
float hash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
float fbm3(vec2 p) { return vnoise(p) * .55 + vnoise(p * 2.1 + 5.2) * .3 + vnoise(p * 4.3 + 9.7) * .15; }
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
 * 2 flow (u v in metres, flow speed m/s along v, open water 0..1: how many shore lines it gets),
 * 3 shore direction (x z toward the nearest land, any length; 0 0 or missing: the wind direction).
 * Still water passes world x z as u v and speed 0.
 */
export const WATER_VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 1) in vec2 info;
layout(location = 2) in vec4 flow;
layout(location = 3) in vec2 shoreDir;
uniform mat4 view, projection;
out vec2 vDir;
out vec3 vWorld;
out vec2 vInfo;
out vec4 vFlow;

void main() {
    vWorld = position;
    vInfo = info;
    vFlow = flow;
    vDir = shoreDir;
    gl_Position = projection * view * vec4(position, 1.0);
}`;

/** Flat low poly water: depth colour, toon dashes that glint in the sun, specks, shore foam lines near the camera, river streaks. */
export const WATER_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec2 vInfo;
in vec4 vFlow;
in vec2 vDir;
uniform vec3 shallow, deep, foamColor;
uniform float time, opacity, clarity, skyTint;
uniform float glintDark, glintScale, glintLength, glintLane, glintStrength, glintSpecks, glintSpeed, glintFar;
uniform float foamRim, foamWobble, foamWobbleScale, foamLines, foamWidth, foamSpacing, foamSpeed, foamPieces, foamAmount, foamFar;
uniform float streakAmount, streakLength, streakWidth, foamContact;
uniform vec3 contacts[32]; // x z radius: things standing in the water
uniform int contactCount;
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

/** like \`dashes\` in square cells \`cell\` metres, each dash lying across \`dir\` (unit), never past its cell */
float rdashes(vec2 p, vec2 dir, float cell, float halfLength, float thick, float keep, float seed, float px) {
    vec2 g = p / cell, id = floor(g), f = fract(g);
    float h = hash2(id + seed), h2 = hash2(id + seed + 17.0);
    vec2 m = (f - .5 - (vec2(h2, h) - .5) * .1) * cell;
    float mx = dot(m, vec2(-dir.y, dir.x)), my = dot(m, dir);
    float len = min(halfLength * (.5 + h2 * .6), cell * .4), taper = 1.0 - clamp(abs(mx) / len, 0.0, 1.0);
    my += (mx / max(len, .01)) * (mx / max(len, .01)) * thick * (h - .5) * 1.5;
    return inside(thick * pow(taper, .35), abs(my), px) * step(abs(mx), len) * step(h, keep);
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
        float mpp = length(fwidth(vWorld.xz)), thick = glintScale * .07, d;
        if (river > .5) {
            // rivers: across the stream, carried with it
            vec2 p = vec2(uv.y, vFlow.x);
            d = max(dashes(p, vec2(glintScale, glintLength * 1.8), glintLength * .5, thick, .75, 0.0, mpp),
                    dashes(p + glintScale * .5, vec2(glintScale * 1.3, glintLength * 2.3), glintLength * .4, thick, .6, 31.0, mpp));
        } else {
            // sea and lakes: along the shore, drifting in toward land. Two layers half a cycle apart cross fade
            // (a flow map), so the drift never piles up and the dashes come and go gently
            vec2 dir = dot(vDir, vDir) > 1e-4 ? normalize(vDir) : vec2(.87, .5);
            float period = 6.0, ph = time / period, f1 = fract(ph), f2 = fract(ph + .5), w1 = 1.0 - abs(f1 * 2.0 - 1.0);
            float cell = glintLength * 1.4;
            float d1 = rdashes(vFlow.xy - dir * f1 * period * glintSpeed, dir, cell, glintLength * .5, thick, .7, floor(ph) * 7.0, mpp);
            float d2 = rdashes(vFlow.xy - dir * f2 * period * glintSpeed + cell * .5, dir, cell, glintLength * .5, thick, .7, floor(ph + .5) * 7.0 + 31.0, mpp);
            d = d1 * w1 + d2 * (1.0 - w1);
        }
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
            // the rim: crisp broken foam, its outer edge rough (three octaves), holes toward the outside, a few loose bits;
            // the whole band washes in and out a little, out of step along the shore
            float sway = sin(time * .9 + vnoise(vWorld.xz / 25.0) * 6.28);
            float edge = foamRim * (1.0 + .35 * sway);
            float rough = fbm3(vWorld.xz / max(foamRim * 2.2, .05) + vec2(0, time * .04));
            float band = 1.0 - hard(edge + (rough - .5) * foamRim * 1.6, s);
            float holes = hard(.3 + .3 * smoothstep(edge * .25, edge, s), fbm3(vWorld.xz / max(foamRim * .9, .03) - time * .03));
            float bits = (1.0 - hard(edge * 1.8, s)) * hard(.7, fbm3(vWorld.xz / max(foamRim * .8, .03) + 3.1 + time * .02));
            float rim = max(band * max(holes, 1.0 - smoothstep(0.0, edge * .35, s)), bits) * pixels(foamRim * .5, mpp);
            // waves: lines form offshore, run in to the rim and fade there. Tight, a bit rough at the edges and of
            // varying thickness along their length; each its own pieces, not every one shows
            float wband = max(foamSpacing * foamLines, .01), sl = s - edge;
            float phase = sl / max(foamSpacing, .01) + time * foamSpeed, k = floor(phase), life = sl / wband;
            float dl = (fract(phase) - .5) * foamSpacing + (fbm3(vWorld.xz / max(foamSpacing * .5, .05) + k * 3.3) - .5) * foamWidth;
            float thick = foamWidth * (.35 + .9 * vnoise(vWorld.xz / max(foamSpacing * 1.5, .05) + k * 1.7));
            float line = (1.0 - hard(thick * .5, abs(dl))) * pixels(foamWidth, mpp) * step(0.0, sl);
            line *= smoothstep(1.0, .55, life) * smoothstep(0.0, .3, life) * step(hash2(vec2(k, 3.0)), .75) * .9;
            line *= hard(foamPieces, vnoise(vWorld.xz / (foamSpacing * 4.0) + vec2(k * 7.31, k * 3.17))) * clamp(vFlow.w + .3, 0.0, 1.0);
            // things in the water (rocks, legs): the same broken foam, a thin ring
            // ring width grows with the thing: a leg gets a few centimetres, a big rock most of a shore rim
            float cd = 1e4, cw = foamContact;
            for (int i = 0; i < 32; i++) {
                if (i >= contactCount) break;
                float di = length(vWorld.xz - contacts[i].xy) - contacts[i].z;
                if (di < cd) { cd = di; cw = foamContact + contacts[i].z * .15; }
            }
            float cr = fbm3(vWorld.xz / max(cw * 2.0, .02) + time * .05);
            float ring = (1.0 - hard(cw * (1.0 + .25 * sway) + (cr - .5) * cw * 1.6, cd));
            ring *= max(hard(.33, fbm3(vWorld.xz / max(cw * .8, .02) - time * .04)), 1.0 - smoothstep(0.0, cw * .4, cd));
            rim = max(rim, ring * pixels(cw * .5, mpp));
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
