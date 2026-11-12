import '@polywar/gallery';
import '@polywar/character-preview';
import { Skeleton } from '@polywar/skeleton';

// characters (assets/models/characters/<name>/) get the skeleton (IK) and open in the character preview
const gallery = document.querySelector('pw-gallery');
const character = src => src?.includes('/characters/');
gallery.skin = (gltf, url) => character(url) ? Skeleton.skin(gltf, url) : undefined;
gallery.opener = (item, animation) => {
    if (!character(item.src)) return undefined;
    const preview = document.createElement('pw-character-preview');
    preview.setAttribute('animation', animation);
    preview.setAttribute('src', item.src);
    return preview;
};
