import { Weather } from '@polywar/weather';
import { Sky } from '@polywar/sky';
import { Precipitation } from '@polywar/precipitation';
import { Lightning } from '@polywar/lightning';
import { WeatherAudio } from '@polywar/weather-audio';

/**
 * The camp's weather: sky (day / night), rain / snow, lightning + thunder, weather sound. One mild climate.
 * URL `?hour=22`, `?weather=rain|storm|clear|snow`. Console: `weather.set({ hour, wetness, storm, speed, day })`.
 */
export function campWeather({ layer, renderer, mixer, ground, blast }) {
    const q = new URLSearchParams(location.search);
    const mode = q.get('weather');
    const climate = { temperature: mode === 'snow' ? .15 : .55, moisture: .5 };
    const weather = new Weather({ climate: () => climate, speed: 5 });
    const sky = new Sky(layer), rain = new Precipitation(layer, { ground }), bolts = new Lightning(layer, { ground });
    const sound = new WeatherAudio({ mixer });
    const clear = { ...renderer.light };
    const s = { hour: q.has('night') ? 23 : +(q.get('hour') ?? 14), day: 0, wetness: { rain: .7, storm: .75, snow: .7, clear: -1 }[mode] ?? 0, storm: mode === 'storm' ? .8 : null };
    let eye = [0, 0, 0], right = [1, 0, 0];
    bolts.onstrike = b => {
        const dx = b.position[0] - eye[0], dz = b.position[2] - eye[2], d = Math.hypot(dx, b.position[1] - eye[1], dz);
        sound.thunder(d, (dx * right[0] + dz * right[2]) / (Math.hypot(dx, dz) || 1));
        // close: it lands like a shell (`blast(at)`: the camp's explosion + its sound)
        if (b.kind === 'ground' && d < 350) setTimeout(() => blast?.(b.position), b.hit * 1000);
    };
    return {
        weather, sky, rain, bolts, sound,
        set(o) { if (o.speed != null) weather.o.speed = o.speed; Object.assign(s, o); },
        /** every frame before drawing; `under` what the player is under ({ vehicle: 1 }), `inside` 0..1 */
        step(camera, dt, under = {}, inside = 0) {
            const e = camera.worldPosition ?? { x: 0, y: 0, z: 0 }, v = camera.viewMatrix;
            eye = [e.x, e.y, e.z]; right = [v[0], v[4], v[8]];
            s.hour = (s.hour + s.day * dt) % 24;
            sky.setTime(s.hour);
            weather.o.bias = s.wetness;
            weather.update(dt);
            const w = weather.at(e.x, e.z), storm = s.storm ?? w.storm;
            bolts.storm = storm; bolts.base = w.base;
            bolts.update(dt);
            Object.assign(sky.state, { cover: Math.max(w.cover, storm * .9), grey: Math.max(w.grey, storm * .8), drift: weather.drift, base: w.base, flash: bolts.flash, flashAt: bolts.flashAt });
            sky.light(clear, renderer.light);
            const k = Math.max(w.precipitation, storm * .7);
            Object.assign(rain.state, { intensity: k, snow: w.snow, wind: [weather.o.wind[0] * .4, weather.o.wind[1] * .4] });
            rain.update(dt);
            Object.assign(sound.state, { rain: w.snow ? 0 : k, snow: w.snow ? k : 0, wind: Math.min(1, .15 + w.cover * .4 + storm * .4), surfaces: { ground: 1, leaves: .3 }, under, inside });
            sound.update(dt);
            return w;
        },
        /** right after `renderer.begin` */
        drawSky(camera) { sky.draw(camera); renderer.reset(); },
        /** after the world (see-through, depth tested) */
        drawAfter(camera) { bolts.draw(camera); rain.draw(camera); renderer.reset(); },
    };
}
