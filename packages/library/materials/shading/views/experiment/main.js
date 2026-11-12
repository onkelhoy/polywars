import '@polywar/3d-asset-preview';
import { SHADINGS, ShadingBall } from '@polywar/shading';

// one shading on its preview ball in pw-3d-asset-preview (3d-demo camera + light panel)
const preview = document.querySelector('#view'), select = document.querySelector('#style');
select.innerHTML = Object.keys(SHADINGS).map(k => `<option>${k}</option>`).join('');
const show = () => { const shading = SHADINGS[select.value]; preview.scene = layer => new ShadingBall(layer, shading); };
select.onchange = show;
show();
