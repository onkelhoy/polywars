# @polywar/roads

Road networks between sites, pure CPU. Classes `highway`, `road`, `lane`, `path`, `rail`; per class (era preset `ERAS.ww2`): width, shoulder, max grade, turn cost, min curve radius, bridge / tunnel cost + reach, reuse discount, surface.

```js
const roads = new Roads(ground, { era: "ww2" });   // ground: { n, cell, size, height, seaLevel, water? }
roads.build(sites);                                  // sites: @polywar/sites Site[]
roads.network;        // { roads: [{ id, class, from, to, points [x y z], spans [{ kind ground|bridge|tunnel, from, to }], width, surface }], junctions }
roads.at(siteId);     // junction at a site: every incoming road + angle (for town builders)
roads.nearest(x, z);  roads.mask(m);  roads.route(ax, az, bx, bz, "road", 4);  // k alternatives
```

How: topology per class (highways: Gabriel graph of cities, rail: spanning tree + loop, roads: villages to 2–3 nearest, lanes: farms, paths: landmarks) → A* on a coarse grid (`cell` m, 16 headings, `@polywar/pathfinding`): grade over the class max is very dear (switchbacks), turns cost, roads already built are cheaper (shared trunks, junctions where they part), bridges over water / deep valleys and tunnels through ridges as straight jumps → split at junctions → smoothed (Douglas–Peucker + Chaikin by min radius), resampled every `step` m, bed graded.

Terrain: `roadHooks(sitesOf, options)` gives `@polywar/terrain` hooks: sites + roads on the raw map, `carve` (bed + banks, `hard` mask so erosion leaves it), after rivers `bridgeWater` (crossings → bridges). `roadEdge(roads)` = metres to the nearest road edge (ecosystem `Ground.road`), `ribbons(network, quad)` = surface strips.

View: `views/experiment` (raw terrain, all classes, A → B alternatives, inspect site junctions, class knobs, full terrain toggle).
