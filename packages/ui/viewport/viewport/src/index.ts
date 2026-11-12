import { Viewport } from './component.js';

export * from "./component.js";
export * from "@polywar/viewport-camera";
export * from "./types.js";

if (!window.customElements) throw new Error('Custom Elements not supported');
if (!window.customElements.get('pw-viewport')) window.customElements.define('pw-viewport', Viewport);
