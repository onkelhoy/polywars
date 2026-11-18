# Jeep, iteration 2 (confirmed, `feature/jeep`)
Rough first pass each; owner refines after.

1. [x] Glass: clear panes + a few thin white streaks (own see-through part). Streaks only if the renderer can't blend.
2. [x] Gears: automatic 3-speed (rpm, ratios, short power cut per shift, engine braking). Top speed 105 km/h default (real Willys MB), `boost` setting for 150+.
3. [x] Engine sound: generated loop, pitch / volume follow rpm, dip + rise on shifts, idle at a stop, handbrake skid. papit `audio` (3D).
4. [x] Car collisions: all vehicles in one shared world (jeeps hit each other), bullets hit jeeps. Tents later.
5. [x] Dust: dirt / gravel puffs behind the wheels, more with speed + slip, coloured by the ground.
6. [x] Driver seated: character sitting at the seat, hands on the rim by IK; each hand follows about one turn, then lets go and grabs again further round.
7. Gun on the passenger seat: getting in puts it there; getting out you lean over and take it (hand to the gun's grip).
8. Camera focus: reusable "look at this" mode for short moments; mouse nudges a little, springs back to the target. Used for the grab in 7.

## Notes (for a fresh context)
- Owner tests 1-5 in the browser (sound unheard so far; dust looked streaky over the bank in the range: maybe SSAO).
- Pieces: `tools/blender/packs/jeep.py` -> `assets/models/vehicles/willys-jeep/` (model.glb, vehicle.json: wheels, seat, eye, exit, steeringWheel axis). `@polywar/vehicle` (Vehicle, Vehicles shared world + bullet cast, NearSolids, Dust; view `drive`), `@polywar/vehicle-audio` (EngineSound; view `engine`), `@polywar/impacts` `emit`.
- Range glue: `packages/play/shooting-range/views/range/main.js` bottom (fleet, enter / leave on E, seat / chase cam via one camera controller wrapping `player.controller`, engine per car, dust). Jeeps in range.json `vehicles` (exporter role "vehicle"; camp jeep mesh nose is -y, yaw + pi).
- Math on `@papit/vector` / `quaternion` / `matrix`; own helpers only where they save allocations.
- 6: `Player.drawSeated` + `SteeringHands` (vehicle pkg); seat / eye lowered 12 cm (window frame in view), pedal / knee offsets in range main.js `FEET` / `KNEES`.
