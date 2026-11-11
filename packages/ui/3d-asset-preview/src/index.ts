import { 3dAssetPreview } from './component.js';

// export 
export * from "./component";
export * from "./types";

// Register the element with the browser

if (!window.customElements) {
  throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pw-3d-asset-preview')) {
  window.customElements.define('pw-3d-asset-preview', 3dAssetPreview);
}
