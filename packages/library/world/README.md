# @polywar/world

A whole world in one object: `@polywar/terrain` (with water) + `@polywar/ecosystem` (nature from `@polywar/nature`), drawn with `@polywar/scatter` (props) and `@polywar/grass` (grass round the camera). One share code for all of it.

## Usage

```js
import { Renderer } from "@polywar/renderer";
import { loadNature } from "@polywar/nature";
import { World } from "@polywar/world";

const renderer = new Renderer(layer);
const world = new World(layer, renderer, await loadNature(), "t1~e1", { quality: "medium" });
world.onchange = () => { /* nature grown (after every terrain / ecosystem change) */ };

// each frame
renderer.begin(camera, sky);
world.draw(camera, renderer.light, time);   // terrain, props, grass (grass follows the camera)

world.code;            // "<terrain code>~<ecosystem code>": send this to the other players
world.load(code);      // or settings { terrain, ecosystem } / JSON text
world.setView({ quality: "low", grass: false });   // per player: quality, grass, props, style
```

- `world.terrain`, `world.ecosystem`, `world.scatter`, `world.grass`: the parts, for their own settings.
- Terrain changes regrow the nature on the new ground; ecosystem changes keep the terrain.
- Grass is planted from `ecosystem.grassAt` in a window round the camera (low 30 m, medium 50, high 75).

## Views

- `world`: editor. World code (in the url), terrain seed / preset / quality, nature seed + sliders, view quality, wind; buttons to stand in a forest, meadow, dry edge or town; minimap of biomes or a cover map (trees, grass, height, dry, flowers), click to go there.
