import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer, DAYLIGHT } from '@polywar/renderer';
import { Sky } from '@polywar/sky';
import { Precipitation } from '@polywar/precipitation';
import { AudioMixer } from '@papit/audio';
import { WeatherAudio } from '@polywar/weather-audio';

// rain / snow over a floor with a few boxes; the sky goes grey with it, the floor darkens as it gets wet
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), gl = demo.gl, sky = new Sky(demo.layer);
const rain = new Precipitation(demo.layer, { ground: () => 0 });
const clear = { ...DAYLIGHT, fogDensity: .002 };
const box = upload(gl, new MeshBuilder().box([.36, .5, .26], {}).build());
const at = (x, y, z, sx, sy, sz) => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1];
const mixer = new AudioMixer();
let sound;
$('#sound').onclick = () => { mixer.unlock(); sound ??= new WeatherAudio({ mixer }); };
Object.assign(window, { rain, sky });
let last = performance.now();
demo.draw = camera => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    const k = Number($('#intensity').value), snow = $('#snow').checked, w = Number($('#wind').value);
    Object.assign(rain.state, { intensity: k, snow, wind: [w, w * .3] });
    rain.update(dt);
    if (sound) { Object.assign(sound.state, { rain: snow ? 0 : k, snow: snow ? k : 0, wind: Math.min(1, Math.abs(w) / 15 + .1) }); sound.update(dt); }
    Object.assign(sky.state, { cover: .75 + k * .25, grey: .6 + k * .4 });
    sky.light(clear, renderer.light);
    // wet floor darker, snow lying whiter
    const g = 1 - rain.wetness * .45, sn = rain.snowCover;
    const floor = [.36 * g + (.9 - .36 * g) * sn, .5 * g + (.92 - .5 * g) * sn, .26 * g + (.95 - .26 * g) * sn];
    $('#values').value = `wetness ${rain.wetness.toFixed(2)} · snow lying ${sn.toFixed(2)}`;
    renderer.begin(camera, [0, 0, 0, 1]);
    sky.draw(camera);
    renderer.draw(box, at(0, -1, 0, 4000, 2, 4000), { tint: [floor[0] / .36, floor[1] / .5, floor[2] / .26, 1] });
    for (let i = 0; i < 8; i++) renderer.draw(box, at(Math.cos(i) * 12, 1.5, -10 - i * 6, 3, 3, 3));
    rain.draw(camera);
    renderer.reset();
};
demo.look([0, 1.7, 6], [0, 1.5, -20]);
