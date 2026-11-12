# @polywar/scatter

Many static glTF props (trees, rocks, plants), instanced. Each model's props are sorted into square chunks; a frame draws only the chunks in view and in range of the prop's kind, neighbouring chunks in one call. Trees sway in the wind, far props shrink away instead of popping.

## Usage

```js
import { Renderer } from "@polywar/renderer";
import { Scatter } from "@polywar/scatter";

const scatter = new Scatter(renderer, (name, lod) => `/assets/models/nature/${name}${lod ? `.lod${lod}` : ""}.glb`, { quality: "medium" });
await scatter.place(batches);   // [{ model, kind, data, count }], data 8 floats each: x y z scale yaw tint sway _ (@polywar/ecosystem batches fit)

// each frame, after renderer.begin(camera)
scatter.draw(camera, time);
scatter.drawn; scatter.calls;   // props / draw calls last frame
```

Models load on first use (`Model.load`, cached per name) and draw once in.

## Options

| Option | What |
| --- | --- |
| `quality` | `low` / `medium` / `high`: draw distances times .5 / 1 / 1.6 |
| `distance` | metres per kind at medium: tree 950, rock 420, cactus 500, bush 340, deadwood 260, plant 110, flower 85, grass 70, water 140, `default` 200 |
| `fade` | last part of the distance where props shrink away (.15) |
| `lods` | where lod 1, 2 start, parts of the draw distance ([.12, .3, .6]); missing levels draw the next better one |
| `wind` | `direction` x z, `strength` (top sway, metres per metre of height, times the prop's `sway`) |

Drawing is `Renderer.drawInstanced` (`@polywar/renderer`): per instance 6 `x y z scale`, 7 `yaw tint sway _`.

## Views

- `forest`: random props of every family on a flat field, count / quality / wind.
