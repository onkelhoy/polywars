import '@polywar/3d-asset-preview';
import { Character } from '@polywar/characters';

const CHARACTERS = ['/assets/models/characters/base/character.json'];
const $ = s => document.querySelector(s);
const preview = $('pw-3d-asset-preview');

async function show(url) {
    const character = await Character.load(url);
    window.character = character; // for the console
    preview.skin = character.skin;
    preview.src = character.model;
    preview.addEventListener('load', () => {
        const missing = character.missing(preview.model.skin);
        $('#info').textContent = `${character.name} · ${character.base?.name} · ${missing.length ? `missing: ${missing.join(', ')}` : 'fits the base rig'}`;
    }, { once: true });
}

for (const url of CHARACTERS) $('#pick').add(new Option(url.split('/').at(-2), url));
$('#pick').onchange = e => show(e.target.value);
show(CHARACTERS[0]);
