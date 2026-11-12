# @polywar/nature

The nature model list: `assets/models/nature/nature.json`. **Kept by hand**: when new models land in `assets/models/nature/`, add a family (or a model / variant to one). Placement (`@polywar/ecosystem`) only knows models that are listed.

## The list

```jsonc
{
  "base": "/assets/models/nature/",      // url folder of the .glb files
  "missing": ["mushrooms", ...],          // notes: kinds the pack lacks
  "families": [{
    "name": "PineTree",
    "kind": "tree",                        // tree bush rock cactus plant flower grass deadwood water crop (or new)
    "tags": ["pine", "conifer"],           // rules pick families by kind / tags
    "biomes": ["forest", "hills", ...],    // terrain biome names it fits; [] = never by biome (crops)
    "models": ["PineTree_1", ...],         // file names without .glb
    "variants": { "snow": [...], "autumn": [...] },  // same length / order as models
    "height": 3.12, "radius": 0.9,         // model size at scale 1 (measured from the glb), metres
    "scale": [2.2, 3.6],                   // world scale range
    "slope": 0.55,                         // steepest ground, 0 flat .. 1 vertical
    "sway": 0.25,                          // wind 0..1
    "grass": "ring",                       // none: no grass under it, ring: taller grass around, keep
    "water": "near"                        // optional: near = likes water close, on = floats (lilypad)
  }]
}
```

Known variants: `snow`, `autumn`, `moss`. Dead trees are their own families (tag `dead`).

## API

```js
import { loadNature, find, modelName, modelUrl, allModels } from "@polywar/nature";

const list = await loadNature();                    // fetches NATURE_URL
find(list, { kind: "tree", tags: ["pine"] });       // families
modelUrl(list, modelName(family, 2, "snow"));       // "/assets/models/nature/PineTree_Snow_3.glb"
```

## Views

- `gallery`: every family by kind, variants as own rows, with biomes / scale / slope.
