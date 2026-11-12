import '@polywar/3d-asset-preview';
import { WATER_LOOKS, WaterSample } from '@polywar/water-material';

// the material alone: sea round a small island in pw-3d-asset-preview
const preview = document.querySelector('#view'), select = document.querySelector('#look');
select.innerHTML = Object.keys(WATER_LOOKS).map(k => `<option>${k}</option>`).join('');
const show = () => { const look = WATER_LOOKS[select.value]; preview.scene = layer => new WaterSample(layer, look); };
select.onchange = show;
show();
