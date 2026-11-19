# Jeep, iteration 2 (confirmed, `feature/jeep`)
Rough first pass each; owner refines after.

7. Gun on the passenger seat: getting in puts it there; getting out you lean over and take it (hand to the gun's grip).

## Notes (for a fresh context)
- Owner tests 1-5 in the browser (sound unheard so far; dust looked streaky over the bank in the range: maybe SSAO).
- Pieces: `tools/blender/packs/jeep.py` -> `assets/models/vehicles/willys-jeep/` (model.glb, vehicle.json: wheels, seat, eye, exit, steeringWheel axis). `@polywar/vehicle` (Vehicle, Vehicles shared world + bullet cast, NearSolids, Dust; view `drive`), `@polywar/vehicle-audio` (EngineSound; view `engine`), `@polywar/impacts` `emit`.
- Range glue: `packages/play/shooting-range/views/range/main.js` bottom (fleet, enter / leave on E, seat / chase cam via one camera controller wrapping `player.controller`, engine per car, dust). Jeeps in range.json `vehicles` (exporter role "vehicle"; camp jeep mesh nose is -y, yaw + pi).
- Math on `@papit/vector` / `quaternion` / `matrix`; own helpers only where they save allocations.
- 6: `Player.drawSeated` + `SteeringHands` (vehicle pkg); seat / eye lowered 12 cm (window frame in view), pedal / knee offsets in range main.js `FEET` / `KNEES`.
