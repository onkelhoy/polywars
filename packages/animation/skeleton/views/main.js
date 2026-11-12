import '@polywar/3d-asset-preview';
import { Skeleton } from '@polywar/skeleton';

// the base rigs; more (spiders, ...) join here
const RIGS = {
    humanoid: '/assets/models/characters/base/model.glb',
    quadruped: '/assets/models/animals/farm/Cow.glb',
    biped: '/assets/models/characters/bird/model.glb',
};
const preview = document.querySelector('pw-3d-asset-preview');
preview.skin = Skeleton.skin;
window.preview = preview; // for the console

const nav = document.querySelector('#rigs');
function show(name) {
    preview.src = RIGS[name];
    for (const b of nav.children) b.classList.toggle('on', b.textContent === name);
}
for (const name of Object.keys(RIGS)) {
    const button = document.createElement('button');
    button.textContent = name;
    button.onclick = () => show(name);
    nav.append(button);
}
show('humanoid');
