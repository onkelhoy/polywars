import { Demo3D } from './component.js';

export * from "./component";
export * from "./controllers";
export * from "./types";

if (!window.customElements) throw new Error('Custom Elements not supported');
if (!window.customElements.get('pw-3d-demo')) window.customElements.define('pw-3d-demo', Demo3D);
