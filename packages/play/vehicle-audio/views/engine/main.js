import { AudioMixer } from '@papit/audio';
import { EngineSound } from '@polywar/vehicle-audio';

const $ = s => document.querySelector(s);
const mixer = new AudioMixer();
let engine, revving = 0;
const state = { rpm: 800, load: 0, slip: 0 };
for (const k of Object.keys(state)) $('#' + k).oninput = e => { state[k] = +e.target.value; e.target.nextElementSibling.textContent = e.target.value; };
$('#start').onclick = () => { mixer.unlock(); engine ??= new EngineSound({ mixer }); };
// full throttle up through 3 gears, a cut + eased load on each shift
$('#rev').onclick = () => { $('#start').onclick(); revving = performance.now(); };
const tick = () => {
    if (revving)
    {
        const t = (performance.now() - revving) / 1000, gears = [3, 4, 6];
        let left = t, g = 0;
        while (g < 2 && left > gears[g]) left -= gears[g++];
        const shift = g > 0 && left < .55;
        state.rpm = shift ? 2400 - left * 400 : 1200 + 2600 * Math.min(1, left / gears[g]);
        state.load = shift ? Math.max(0, (left - .3) / .25) : 1;
        if (t > 13) { revving = 0; state.rpm = 800; state.load = 0; }
    }
    engine?.update(state);
    requestAnimationFrame(tick);
};
tick();
