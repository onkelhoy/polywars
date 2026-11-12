import { AssetPreview3D } from './component.js';

// export
export * from "./component.js";
export * from "./types.js";

// Register the element with the browser
if (!window.customElements)
{
    throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pw-3d-asset-preview'))
{
    window.customElements.define('pw-3d-asset-preview', AssetPreview3D);
}
