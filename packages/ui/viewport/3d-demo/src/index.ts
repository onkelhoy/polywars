import { Demo3D } from './component.js';

export * from "./component.js";
export * from "./controllers.js";
export * from "./types.js";

if (!window.customElements) throw new Error('Custom Elements not supported');
if (!window.customElements.get('pw-3d-demo')) window.customElements.define('pw-3d-demo', Demo3D);
