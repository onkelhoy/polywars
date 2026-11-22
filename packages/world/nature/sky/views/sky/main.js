import '@polywar/viewport';
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Renderer, DAYLIGHT } from '@polywar/renderer';
import { Sky } from '@polywar/sky';
import { Weather } from '@polywar/weather';

// sky dome + cloud layer driven by @polywar/weather at the camera; a ground and pillars to see the light / fog
const $ = s => document.querySelector(s);
const demo = $('#view');
await demo.ready;
const renderer = new Renderer(demo.layer), gl = demo.gl;
const sky = new Sky(demo.layer);
const climate = () => ({ temperature: Number($('#heat').value), moisture: Number($('#moisture').value) });
const weather = new Weather({ climate });
const clear = { ...DAYLIGHT, fogDensity: .00015 };
renderer.light.sunDirection = [...DAYLIGHT.sunDirection];
const floor = upload(gl, new MeshBuilder().box([.36, .5, .26], {}).build());
const pillar = upload(gl, new MeshBuilder().box([.7, .65, .55], {}).build());
const at = (x, y, z, sx, sy, sz) => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1];
let last = performance.now();
Object.assign(window, { sky, weather });

demo.draw = camera => {
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now;
    const w = Number($('#wind').value);
    Object.assign(weather.o, { bias: Number($('#bias').value), speed: Number($('#speed').value), wind: [w, w * .3] });
    weather.update(dt);
    const e = camera.worldPosition ?? { x: 0, z: 0 }, ws = weather.at(e.x, e.z);
    const hour = $('#hour'), run = Number($('#clock').value);
    if (run) hour.value = (Number(hour.value) + run * dt) % 24;
    sky.setTime(Number(hour.value), Number($('#phase').value));
    Object.assign(sky.state, { cover: ws.cover, grey: ws.grey, drift: weather.drift, base: ws.base });
    sky.look.cloudScale = Number($('#scale').value);
    sky.look.bands = Number($('#bands').value);
    clear.sunDirection = sky.state.sun;
    sky.light(clear, renderer.light);
    $('#values').value = `${Number(hour.value).toFixed(1)} h · ${ws.kind} · humidity ${ws.humidity.toFixed(2)} · cover ${ws.cover.toFixed(2)} · grey ${ws.grey.toFixed(2)} · ${ws.precipitation > 0 ? (ws.snow ? 'snow' : 'rain') + ' ' + ws.precipitation.toFixed(2) : 'dry'}${ws.storm ? ' · storm ' + ws.storm.toFixed(2) : ''}`;
    renderer.begin(camera, [0, 0, 0, 1]);
    sky.draw(camera);
    renderer.draw(floor, at(0, -1, 0, 20000, 2, 20000));
    for (let d = 100; d <= 3000; d += 150) for (const x of [-40, 40]) renderer.draw(pillar, at(x, 15, -d, 8, 30, 8));
    renderer.reset();
};
demo.look([0, 2, 20], [0, 60, -100]);
