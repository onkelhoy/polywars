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
uniform float glintDark, glintScale, glintLength, glintLane, glintStrength, glintSpecks, glintSpeed, glintFar, glintDensity, glintMelt, glintGlow;
uniform float foamRim, foamWobble, foamWobbleScale, foamLines, foamWidth, foamSpacing, foamSpeed, foamPieces, foamAmount, foamFar;
uniform float streakAmount, streakLength, streakWidth, foamContact, paintAmount, paintScale, horizon;
uniform vec3 contacts[32]; // x z radius: things standing in the water
uniform vec4 contactShape[96]; // 12 radius scales per contact, round from +x toward +z: its real outline
uniform int contactCount;
uniform bool under, hasDepth, hasShore;
uniform sampler2D sceneDepth, shoreMap; // depth of the scene drawn before the water; signed metres to the shore (< 0 on land)
uniform mat4 invViewProj;
uniform vec4 shoreRect; // x z of the map's first node, metres per node, nodes per side
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

/** signed metres to the shore from the shore map (< 0 on land) */
float shoreAt(vec2 xz) { return texture(shoreMap, ((xz - shoreRect.xy) / shoreRect.z + .5) / shoreRect.w).r; }

/** the first thing drawn behind this pixel (world), w 0 when nothing (sky) */
vec4 groundAt() {
    float z = texelFetch(sceneDepth, ivec2(gl_FragCoord.xy), 0).r;
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(sceneDepth, 0));
    vec4 w = invViewProj * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    return vec4(w.xyz / w.w, step(z, .99999));
}

/** value noise squashed along \`heading\` (one of 16 directions): long soft streaks \`size\` (along, across) metres, moved \`drift\` metres along it */
float streaks(vec2 p, float heading, vec2 size, float drift) {
    float a = heading * 6.2831853 / 16.0;
    vec2 d = vec2(cos(a), sin(a)), q = vec2(dot(p, vec2(-d.y, d.x)), dot(p, d) - drift) + mod(heading, 16.0) * 37.1;
    return vnoise(q / size) * .65 + vnoise(q / (size * vec2(.45, .55)) + 7.3) * .35;
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

    // the ground under this pixel from the scene depth: the exact water depth wherever the water meets something, and the
    // metres to that waterline on the ground's own slope. Near the camera only (depth precision); the vertex data past that
    float waterDepth = max(vInfo.x, 0.0), shoreRim = vInfo.y, trust = 0.0;
    if (hasDepth) {
        vec4 g = groundAt();
        // the face hit, its normal toward the eye (a seen face always faces it)
        vec3 gc = cross(dFdx(g.xyz), dFdy(g.xyz)), gn = gc / max(length(gc), 1e-8);
        if (dot(gn, eye - g.xyz) < 0.0) gn = -gn;
        float side = length(gn.xz), tanSlope = side / max(gn.y, .02), dv = max(vWorld.y - g.y, 0.0);
        vec2 out2 = side > 1e-3 ? gn.xz / side : vec2(0);
        // the waterline on that face's plane: up the slope from the hit point by depth / slope; this pixel's distance to it.
        // Walls and overhangs: the line is about above the hit point (overhangs: further the deeper)
        float toLine = gn.y > .05
            ? dv / max(tanSlope, .01) + dot(vWorld.xz - g.xz, out2) * smoothstep(.02, .1, side)
            : length(vWorld.xz - g.xz) + max(-gn.y, 0.0) * dv * 4.0;
        // not across a silhouette (the depth jumps there, the face is made up)
        float jump = length(fwidth(g.xyz)), expect = length(fwidth(vWorld)) * (length(g.xyz - eye) / max(dist, .01)) * 3.0;
        trust = g.w * (1.0 - smoothstep(foamFar * .6, foamFar * 1.2, dist));
        waterDepth = mix(waterDepth, dv, trust);
        shoreRim = mix(shoreRim, max(toLine, 0.0), trust * (1.0 - smoothstep(expect, expect * 2.0, jump)));
    }
    // the shore for the waves and the drift: a smooth map, bent a little by noise, so the lines run round, not along every facet
    float shore = vInfo.y;
    vec2 dir = dot(vDir, vDir) > 1e-4 ? normalize(vDir) : vec2(.87, .5);
    if (hasShore && river < .5) {
        vec2 bend = (vec2(vnoise(vWorld.xz / max(foamWobbleScale * 3.0, .1)), vnoise(vWorld.xz / max(foamWobbleScale * 3.0, .1) + 9.1)) - .5) * foamWobble * 6.0;
        shore = shoreAt(vWorld.xz + bend);
        float e = shoreRect.z * 1.5;
        vec2 gr = vec2(shoreAt(vWorld.xz + vec2(e, 0)) - shoreAt(vWorld.xz - vec2(e, 0)), shoreAt(vWorld.xz + vec2(0, e)) - shoreAt(vWorld.xz - vec2(0, e)));
        if (dot(gr, gr) > 1e-8) dir = -normalize(gr);
    }

    // flat colour: shallow to deep, lit as a plane; a little sky at grazing angles
    float deepness = 1.0 - exp(-waterDepth / max(clarity, .01));
    vec3 c = mix(shallow, deep, deepness) * (hemi(up) + sunColor * sunStrength * max(l.y, 0.0) * .6);
    float grazing = pow(1.0 - max(v.y, 0.0), 4.0), graze = grazing * skyTint;
    c = mix(c, mix(ground, sky, .85) * ambient * 1.4, graze * .6);
    float mpp = length(fwidth(vWorld.xz));
    // paint: big soft patches a little lighter / darker and toward the shallow or deep hue, so it is not one flat colour
    if (paintAmount > 0.0) {
        float pn = fbm3(vWorld.xz / max(paintScale, .1) + 1.7) - .5, ph = vnoise(vWorld.xz / max(paintScale * 2.3, .1) + 8.3) - .5;
        float fade = pixels(paintScale * .5, mpp);
        vec3 hue = mix(shallow / max(dot(shallow, vec3(.333)), 1e-3), deep / max(dot(deep, vec3(.333)), 1e-3), ph + .5);
        c *= 1.0 + pn * paintAmount * .6 * fade;
        c = mix(c, c * hue, abs(ph) * paintAmount * .5 * fade);
    }
    vec3 white = foamColor * (hemi(up) + sunColor * sunStrength * .8);

    // the sun's reflection: a lane narrow sideways, long toward the eye (like the sun on real water), opening up toward the horizon
    vec3 rr = reflect(-v, up);
    float w = (glintLane * .35 + .01) * (1.0 + 2.5 * grazing), side = acos(clamp(dot(normalize(rr.xz), normalize(l.xz)), -1.0, 1.0)), tilt = abs(asin(rr.y) - asin(l.y));
    float lane = (1.0 - smoothstep(w * .2, w, side)) * (1.0 - smoothstep(w * 1.0, w * 4.0, tilt));

    // toon glints: darker dashes, white inside the sun's reflection; tiny specks. Past \`far\` the dashes become a smooth sheen
    float near = 1.0 - smoothstep(glintFar * .5, glintFar, dist);
    c = mix(c, white * 1.2, smoothstep(.1, .9, lane) * (1.0 - near) * glintStrength * .4);
    if (near > 0.0 && (glintDark > 0.0 || glintStrength > 0.0 || glintSpecks > 0.0)) {
        // the glare is a patch of light, not per dash: its edge is broken by noise so dashes light up only in pieces
        float glare = clamp(lane * 1.5 + (vnoise(vWorld.xz / max(glintLength * 1.2, .05) + time * .05) - .5) * .9 - .25, 0.0, 1.0);
        float core = smoothstep(.35, 1.0, glare);
        float lit = smoothstep(.05, .2, glare), d, shade;
        if (river > .5) {
            // rivers: dashes across the stream, carried with it; fat and many in the glare's core
            float thick = glintScale * .11 * (1.0 + glintMelt * core * 1.6), keep = mix(glintDensity, 1.0, core * glintMelt) * .75;
            vec2 p = vec2(uv.y, vFlow.x);
            d = max(dashes(p, vec2(glintScale, glintLength * 1.8), glintLength * .5, thick, keep, 0.0, mpp),
                    dashes(p + glintScale * .5, vec2(glintScale * 1.3, glintLength * 2.3), glintLength * .4, thick, keep * .8, 31.0, mpp));
            d *= pixels(thick * 2.0, mpp) * near;
            shade = 1.0 - d * glintDark * (1.0 - lit);
        } else {
            // sea and lakes: noise squashed along the shore, long soft streaks a bit darker and lighter, drifting in to land.
            // The direction snaps to 16 headings, the two nearest blended, so the pattern never swirls where the shore turns
            vec2 size = vec2(glintLength * 1.5, glintScale * .3);
            float h = atan(dir.y, dir.x) / 6.2831853 * 16.0, h0 = floor(h), drift = time * glintSpeed;
            float n = mix(streaks(vFlow.xy, h0, size, drift), streaks(vFlow.xy, h0 + 1.0, size, drift), h - h0);
            n = mix(.5, n, pixels(size.y * 2.0, mpp) * near);
            shade = 1.0 + (n - .5) * 2.0 * glintDark * (1.0 - lit * .5);
            // the crests catch the sun: white spots, fatter and more in the glare's core so there they melt together
            d = hard(mix(.78, .6, core * glintMelt) - glintDensity * .08, n) * pixels(size.y, mpp) * near;
        }
        // only the part under the glare lights up (hard cut: streaks of light)
        c *= shade;
        c += white * glintGlow * core * core * near * (.5 + vnoise(vWorld.xz / max(glintLength * 3.0, .1) - time * .03)); // soft, uneven wash of light under the merged crests
        c = mix(c, white * 1.4, d * lit * glintStrength);
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
        // the rim hugs the exact waterline where the depth is known (a little wobble left); the waves follow the smooth shore
        float s = shoreRim + wob * (1.0 - trust * .75), mpp = fwidth(s), sw = shore + wob, mppw = fwidth(sw);
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
            float wband = max(foamSpacing * foamLines, .01), sl = sw - foamRim;
            float phase = sl / max(foamSpacing, .01) + time * foamSpeed, k = floor(phase), life = sl / wband;
            float dl = (fract(phase) - .5) * foamSpacing + (fbm3(vWorld.xz / max(foamSpacing * .5, .05) + k * 3.3) - .5) * foamWidth;
            float thick = foamWidth * (.35 + .9 * vnoise(vWorld.xz / max(foamSpacing * 1.5, .05) + k * 1.7));
            float line = (1.0 - hard(thick * .5, abs(dl))) * pixels(foamWidth, mppw) * step(0.0, sl);
            line *= smoothstep(1.0, .55, life) * smoothstep(0.0, .3, life) * step(hash2(vec2(k, 3.0)), .75) * .6;
            line *= hard(foamPieces, vnoise(vWorld.xz / (foamSpacing * 4.0) + vec2(k * 7.31, k * 3.17))) * clamp(vFlow.w + .3, 0.0, 1.0);
            // things in the water (rocks, legs): the same broken foam, a thin ring
            // ring width grows with the thing: a leg gets a few centimetres, a big rock most of a shore rim
            float cd = 1e4, cw = foamContact;
            for (int i = 0; i < 32; i++) {
                if (i >= contactCount) break;
                vec2 dv = vWorld.xz - contacts[i].xy;
                float a = fract(atan(dv.y, dv.x) / 6.2831853) * 12.0, fa = fract(a);
                int k0 = int(a) % 12, k1 = (k0 + 1) % 12;
                float r0 = contactShape[i * 3 + k0 / 4][k0 % 4], r1 = contactShape[i * 3 + k1 / 4][k1 % 4];
                float di = length(dv) - contacts[i].z * mix(r0, r1, fa);
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

    // where the depth is known the water thins out to nothing at the waterline
    float a = clamp(mix(opacity, 1.0, deepness) + graze * .3 + foam, 0.0, 1.0) * mix(1.0, smoothstep(0.0, .05, waterDepth), trust * (1.0 - foam));
    c = mix(c, fogColor, 1.0 - exp(-dist * fogDensity));
    // the far sea melts into the sky at the horizon
    c = mix(c, fogColor, pow(1.0 - max(v.y, 0.0), 12.0) * horizon);
    outColor = vec4(pow(c, vec3(1.0 / 2.2)) * a, a);
}`;
