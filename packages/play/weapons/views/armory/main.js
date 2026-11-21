import '@polywar/gallery';
import { Armory } from '@polywar/weapons';

// every gun bare (by action), then each gun with every scope it takes
const gallery = document.querySelector('pw-gallery');
new Armory('/assets').items().then(items => { gallery.items = items; });
