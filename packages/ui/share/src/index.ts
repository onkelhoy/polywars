import { Share } from './component.js';

// export 
export * from "./component";

// Register the element with the browser

if (!window.customElements) {
  throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pw-share')) {
  window.customElements.define('pw-share', Share);
}
export * from "./code";
export * from "./qr";
export { hasCamera, type CameraError } from "./scanner";
