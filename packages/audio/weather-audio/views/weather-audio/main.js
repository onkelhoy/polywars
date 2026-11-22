import { AudioMixer } from '@papit/audio';
import { WeatherAudio } from '@polywar/weather-audio';

const $ = s => document.querySelector(s);
const mixer = new AudioMixer();
let sound, last = performance.now();
$('#start').onclick = () => { mixer.unlock(); sound ??= new WeatherAudio({ mixer, onstrike: st => $('#strike').value = `strike ${Math.round(st.distance)} m, heard in ${st.delay.toFixed(1)} s` }); window.sound = sound; };
for (const i of document.querySelectorAll('input')) { i.nextElementSibling.textContent = i.value; i.oninput = () => i.nextElementSibling.textContent = i.value; }
const tick = now => {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (sound)
    {
        const v = id => +$('#' + id).value;
        Object.assign(sound.state, { rain: v('rain'), wind: v('wind'), snow: v('snow'), inside: v('inside'), storm: v('storm'), detail: v('detail'),
            surfaces: { ground: v('ground'), leaves: v('leaves'), water: v('water') }, under: { roof: v('roof'), tent: v('tent'), vehicle: v('vehicle') } });
        sound.update(dt);
    }
    requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

const PRESETS = {
    drizzle: { rain: .12, wind: .1, ground: 1, leaves: .2, water: 0, roof: 0, tent: 0, vehicle: 0, inside: 0, storm: 0 },
    forest: { rain: .5, wind: .3, ground: .3, leaves: 1, water: 0, roof: 0, tent: 0, vehicle: 0, inside: 0, storm: 0 },
    downpour: { rain: 1, wind: .5, ground: 1, leaves: .3, water: .3, roof: 0, tent: 0, vehicle: 0, inside: 0, storm: 0 },
    tent: { rain: .6, wind: .3, ground: 1, leaves: .2, water: 0, roof: 0, tent: 1, vehicle: 0, inside: .4, storm: 0 },
    shed: { rain: .6, wind: .2, ground: 1, leaves: 0, water: 0, roof: 1, tent: 0, vehicle: 0, inside: .8, storm: 0 },
    car: { rain: .5, wind: .2, ground: 1, leaves: 0, water: 0, roof: 0, tent: 0, vehicle: 1, inside: .9, storm: 0 },
    storm: { rain: .9, wind: .6, ground: 1, leaves: .3, water: 0, roof: 0, tent: 0, vehicle: 0, inside: 0, storm: .8 },
    lake: { rain: .4, wind: .2, ground: .2, leaves: 0, water: 1, roof: 0, tent: 0, vehicle: 0, inside: 0, storm: 0 },
};
for (const b of document.querySelectorAll('[data-p]')) b.onclick = () => {
    $('#start').onclick();
    for (const [k, v] of Object.entries(PRESETS[b.dataset.p])) { const i = $('#' + k); i.value = v; i.nextElementSibling.textContent = v; }
};
for (const b of document.querySelectorAll('[data-t]')) b.onclick = () => { $('#start').onclick(); const d = +b.dataset.t; $('#strike').value = `heard in ${sound.thunder(d, Math.random() * 2 - 1).toFixed(1)} s`; };
