import { Weather } from '@polywar/weather';

// the humidity field over a 60 km map blowing past; climate goes dry + hot (left) to wet + cold (right)
const $ = s => document.querySelector(s);
const SIZE = 60000, N = 160, ctx = $('#map').getContext('2d'), img = ctx.createImageData(N, N);
const climate = (x, z) => { const u = x / SIZE + .5, v = z / SIZE + .5; return { temperature: .9 - u * .75 + v * .1, moisture: u * .9 }; };
const weather = new Weather({ climate });
let last = performance.now();
const frame = now => {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    Object.assign(weather.o, { bias: Number($('#bias').value), speed: Number($('#speed').value) });
    weather.update(dt);
    const kinds = {};
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
    {
        const s = weather.at((i / N - .5) * SIZE, (j / N - .5) * SIZE), k = (j * N + i) * 4;
        kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
        let c = [40 + s.temperature * 80, 70, 60 + (1 - s.temperature) * 60];
        const cloud = 255 - s.grey * 150;
        c = c.map(v => v + (cloud - v) * s.cover);
        if (s.precipitation > 0) c = s.snow ? [150, 230, 255] : [40, 80, 200].map((v, n) => c[n] + (v - c[n]) * s.precipitation);
        if (s.storm > .2) c = [255, 220, 40];
        img.data.set([...c, 255], k);
    }
    ctx.putImageData(img, 0, 0);
    $('#values').value = `${(weather.time / 3600).toFixed(1)} h · ` + Object.entries(kinds).map(([k, n]) => `${k} ${Math.round(n / N / N * 100)}%`).join(' · ');
    requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
