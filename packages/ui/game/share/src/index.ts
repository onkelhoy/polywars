import { Share } from './component.js';

// export 
export * from "./component.js";

// Register the element with the browser

if (!window.customElements)
{
    throw new Error('Custom Elements not supported');
}

if (!window.customElements.get('pw-share'))
{
    window.customElements.define('pw-share', Share);
}
export * from "./code.js";
export * from "./qr.js";
export { hasCamera, type CameraError } from "./scanner.js";
