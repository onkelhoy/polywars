# @polywar/3d-demo

`<pw-3d-demo>`: the stage for 3D package views. A WebGL2 canvas on `@papit/game-engine`, a camera with two modes that switch without losing the pose, a background that follows the light / dark theme, and an overlay panel (the children) whose pointer, wheel and typing never move the camera.

| Mode | Input |
| --- | --- |
| `pan` | drag turns around the pivot, right / shift drag pans over the ground, wheel zooms |
| `fly` | click to look (Esc frees) or right drag, WASD / arrows along the view, E / space up, Q / C down, shift 4x, wheel = speed |

```html
<pw-3d-demo mode="pan">
    <aside>…controls…</aside>
</pw-3d-demo>
```

```js
import "@polywar/3d-demo";
const demo = document.querySelector("pw-3d-demo");
await demo.ready;
const renderer = new Renderer(demo.layer);        // any drawing on demo.layer (Layer3D) / demo.gl
demo.look([6, 5, 8], [0, 0, 0]);                  // camera pose
demo.tick = dt => { /* update */ };
demo.draw = camera => { renderer.begin(camera, demo.background); /* draw */ };
```

Properties: `mode` (`pan | fly`), `speed`, `near`, `far`, `no-bar` (hide the mode bar), `no-axes` (hide the direction arrows bottom-left: X red, Y green, Z blue, faded = pointing away; the bar's `axes` button toggles them). Read: `engine`, `layer`, `gl`, `camera`, `time`, `background`.
The controllers are exported too (`fly`, `panZoom`) for any engine `Camera`.

Used by the grass view and `pw-3d-asset-preview`.
