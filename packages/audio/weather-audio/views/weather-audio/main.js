import { AudioMixer } from '@papit/audio';
import { WeatherAudio } from '@polywar/weather-audio';

const $ = s => document.querySelector(s);
const mixer = new AudioMixer();
let sound, last = performance.now();
$('#start').onclick = () => { mixer.unlock(); sound ??= new WeatherAudio({ mixer }); window.sound = sound; };
for (const i of document.querySelectorAll('input')) { i.nextElementSibling.textContent = i.value; i.oninput = () => i.nextElementSibling.textContent = i.value; }
const tick = now => {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (sound)
    {
        const v = id => +$('#' + id).value;
        Object.assign(sound.state, { rain: v('rain'), wind: v('wind'), snow: v('snow'), inside: v('inside'),
            surfaces: { ground: v('ground'), leaves: v('leaves'), roof: v('roof'), water: v('water'), vehicle: v('vehicle') } });
        sound.update(dt);
    }
    requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
