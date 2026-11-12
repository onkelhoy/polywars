import '@polywar/3d-asset-preview';
import { GRASS_LOOKS, GrassPatch } from '@polywar/grass-material';

// the material alone: a patch of grass in pw-3d-asset-preview (viewport camera + light panel)
const preview = document.querySelector('#view'), select = document.querySelector('#look');
select.innerHTML = Object.keys(GRASS_LOOKS).map(k => `<option>${k}</option>`).join('');
const show = () => { const look = GRASS_LOOKS[select.value]; preview.scene = layer => new GrassPatch(layer, look); };
select.onchange = show;
show();
