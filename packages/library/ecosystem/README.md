# @polywar/ecosystem

Nature for a terrain, pure CPU: **cover maps** (grass density / height / dryness / flowers, props per hectare per group) from biome, climate, slope, water and towns, biome borders blended; then **seeded props** from the `@polywar/nature` list. Drawing is someone else's (`@polywar/scatter` for props, `@polywar/grass` via `grassAt`).

## Usage

```js
import { Ecosystem } from "@polywar/ecosystem";
import { loadNature } from "@polywar/nature";

const eco = new Ecosystem(await loadNature(), { seed: 7 });   // options, JSON text or a share code
eco.grow({ ...terrain.data, biomes: BIOMES, rockSlope: .55, snowHeight: 260 });  // a Ground

eco.batches;            // [{ model, family, kind, group, layer, data, count }] data = x y z scale yaw tint sway solid
eco.grassAt(x, z);      // { density, height, dry, flowers } with props: none under rocks, taller ring round trees (or a bare spot)
eco.code;               // share code ("e1" = defaults); eco.load(code) brings it back
eco.set({ density: 1.5 });  // merge + regrow
```

`Ground`: `TerrainData` from `@polywar/terrain` fits, plus `biomes` (names in index order), optional `rockSlope` (grass gives way to rock) and `snowHeight` (snow cap: snow variants, no grass).

## Settings

| Option | What |
| --- | --- |
| `seed` | placement seed (own seed, apart from the terrain's) |
| `density` | every prop density times this |
| `cover` | `resolution` cells per side of the maps, `blend` metres borders fade over |
| `season` | `autumn` share of autumn trees (in patches), `snow` temperature below which snow variants / no grass |
| `cities` | `clear` radius cleared of props (times the town radius), `grass` / `height` of grass there |
| `around` | grass at props: `ring` (times canopy), `taller`, `bare` share of trees with a bare spot instead |
| `groups` | how families are picked and placed: `select { kind, tags, not }`, `layer` (order), `spacing`, `cluster { scale, amount }`, `temperature` / `moisture` bands, `water` reach, `floats`, `small` (scale bias), `solid`, `max` |
| `biomes` | per biome: `props { group: per hectare }` and `grass { density, height, dry, flowers }` |

Default groups: conifer, broadleaf, willow (near water), palm, dead, rock, cactus, bush, deadwood, plant, flower, clump (grass meshes), lilypad (floats).

Placement: per group a jittered grid as fine as its densest spot; a point stays with the chance the map gives times clumping noise, then the family's slope, water and the room of props placed before (later layers make room for earlier ones). Variant: snow when cold / on the cap, autumn in patches, moss where damp.
