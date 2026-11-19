# Backlog

## Long term goal: browser editor
A full editor in the browser, no download: place assets (scene.json, see World: scene + instancing), pose / animate on the rig, gun hand clips, materials / palette. Grows from the pieces we have (viewport, gallery, gizmo, weapon / hand editor), each a papit-ready package. Blender stays the authoring tool until then.

## Scope / zero (needs planning)
- Default scope hides iron sights, tilting it shoots high; zero steps (10/25/50/100 m) by key, max per gun. Current idea is wrong, replan.

## Rig bake + hands (proposed)
Rig bake done (`export.py --bake`, runtime IK via `Skeleton.addIK` + `HUMANOID.controls`). Next: hands. Numbers kept from the original list.
3. Hand poses as clips: owner poses in model.blend (`hand.grip.pistol`, `hand.grip.wrist`, `hand.grip.fore`, `hand.mag`, `hand.flat`, `hand.open`, `hand.trigger`), exported as clips. Runtime blends them on the hand's bones only (bone mask), per hand, with a weight. Replaces the runtime finger IK curl in `grip()`.
4. Better holding: weapon.json `hands` per gun picks the pose per hand + placement (with the hand editor, see Playable character). Trigger finger blends `hand.trigger` on fire.
5. Mag switch: support hand follows the reload cues: fore -> gun's mag (point from the gun glb) on `mag-out`, mag parented to the hand (`hand.mag` pose) -> pouch (body socket) and a new mag back -> `mag-in` -> fore. Bolt / slide cues: hand to the handle. Times from weapon.json `animation` cues. One hand path per action type (box mag, stripper clip, single rounds / tube, bolt / slide), fitted from the gun's points, shared by all guns of that type.
5b. Per gun hand clips (optional): owner links the base rig into the gun blend and animates hold / cycle / reload with the gun. map-gun bakes per clip (same names as the gun clips): wrist position + rotation in gun space (-> arm IK target, follows the gun when aimed / lowered / recoiling) + finger local rotations (FK onto the real rig); the linked rig is not exported. Replaces the shared path / pose for that gun.
6. Brace hand + 6b aim at a wall: moved to plan.md.
7. FPS viewmodel: same hand clips; finger IK only if the fps close-up needs more (decide after 3).
8. Later, optional: foot planting on uneven ground (leg IK to a ground cast, near the camera only).

## World: materials (proposed, later)
Few shaders, one palette texture: every model UV-maps its faces onto swatches of a tiny colour-swap texture (no material swaps, batches well, recolour = swap the texture / row).
1. Shaders: `opaque` (one for matte + shiny: roughness / metal / emissive come from a second property texture at the same UV), `cutout` (foliage, alpha test + wind), `transparent` (glass, water). That's 3 total.
2. Palette layout: swatch grid, colour texture + property texture, a tool / Blender step to snap model UVs to swatches (replaces the bake to vertex colours in export.py).
3. papit: `game-mesh` draws base colour x COLOR_0 only, no texture sampling: needs texture + UV support (report to owner, not patched here).

## Gun animation map (proposed)
Gun animation map: `animation` property in each gun's weapon.json (format in `.claude/skills/map-gun/SKILL.md`).
0. Rename per gun: `model.blend` / `model.glb` / `weapon.json` -> `<id>.model.blend` / `<id>.model.glb` / `<id>.weapon.json` (all guns; armory, player, manifest, tools/blender + tools/weapons follow).
1. `@polywar/armory`: `animation` in the WeaponFile type.
2. Player: `gunClip` + toggles + empty from the file; drop the hardcoded names, shares and MP40 frames. Fallback: today's name convention.
3. Cues (eject, mag-in, ...) from the file instead of `actions.ts` fractions when present.
4. Points from the owner's empties (`exit.bullet` / `exit.barrel`, `exit.shell`) into weapon.json on export (gun-clips.py), replacing guessed muzzle / eject.
5. Write the `animation` block for kar98k, arisaka-type-99, beretta-m1951, mp40.

## World: scene + instancing (proposed, later)
`tools/blender/export.py` `realize_instances` copies every linked instance into the glb (big files, no instancing).
1. Scene format + loader: `scene.json` = placements (`asset` id from the library + position / rotation / scale) + optional one-off glb; loader draws each asset once, instanced.
2. Blender export: collection instances / linked duplicates of library assets -> placements, only one-off geometry stays in the glb. First user: shooting range.
3. Textures: the `opaque` shader always samples a texture (palette by default, own image for e.g. range targets / distance markers): a texture bind, not a shader swap.
4. World editor (later): pick from the catalog, place with a gizmo, snap, save the same `scene.json`.

## Playable character
- [ ] Elbow lag: elbows (IK pole in `player/src/arms.ts`) trail the hands a little when looking round (from the viewmodel turn springs).
- [ ] Gun reloads as real clips: hands on the magazine / clip, gun turned, sometimes put down. Simple reload first. Kar98k uses `cycle` (open, held, close) for now.
- [ ] More rigged guns like the Kar98k: `bolt` bone, `cycle` / `shoot` / `reload` actions, faces on `wood` / `metal`, `tools/blender/packs/gun-clips.py`.
- [ ] Recoil `control` from a tired / wounded meter; hip fire finesse (two hand grip steadier).
- [ ] Muzzle flash shape (star / cone, not squares).
- Third person camera (body + gun in the hand socket, attachments visible).
- Loadout screen: pick character, attachments, guns; then play.
- Ragdoll death (copy arrow-warfare `ragdoll`, verlet on the knight's bones).
- Damage: hurt arm (`steady` in `Gun.spread`), limbs off later.
- Phase D, body: breath / stamina (run -> sway, hold breath, black-out + look away + blink, out of breath), stances (crouch / sit / prone, capsule height), knight arms in first person (IK to `grip` / `fore` of weapon.json).
- Phase E, animation: base rig clip set (idle, walk, run, stances, transitions), per gun reload / bolt clips as IK targets over time in weapon.json, swap / pick up (toss the held gun as a `@papit/rigidbody` body, same `World` as debris, it settles and stays).
- New rifles are static meshes (no rig): bolts / levers don't move yet (phase E rigs them like `ww2_weapons.py`).
- Scopes: some float ~2 cm over the receiver (P14), `mount` in weapon.json per gun; `lens` (glass radius) is a guess (.018).
- Aperture rear sights (P14, Ross, MAS-36): `notch` is the housing top - 4 mm, set the hole by hand like the M1 if off.
- Pistols / pistol-grip guns (StG, Thompson) still hold by their bones (KIND numbers).
- Gun pose per gun: hip / aim numbers are per kind (`player/src/holds.ts` `KIND`), tune per gun if needed.
- Knight helmet offsets in `character.json` are eyeballed; arms in first person are boxes (no knight arm mesh yet).
- Player on the real world: `ground` = terrain + road decks, colliders from props, bullets cast against them.

- Gun sounds are synthesised (sfx-gen): good enough to play with, real recordings can replace files (list them in `sounds.json`). 20 MB of WAVs (32 kHz mono): OGG / fewer variants if the Pages size matters.
- Other players' guns: same `Feel.cue` with their gun place (far shots already come late and dull by distance).
- Papit reports: `quaternion` has no from-matrix / from-axes (own copies in `player/src/feel.ts` `quaternion`, `skeleton/src/skeleton.ts` `fromMatrix`). `rigidbody` has no heightfield / triangle mesh shape (debris makes hull tiles under moving pieces); its sweep and prune broad phase could be its own package (a general spatial index, papit has none).

- In-game zeroing: keys step the rear sight / scope turret (`Carried.zero`), like a real rifle; the range's `T` panel sets the default per gun.
- Downloads to import later (in ~/Downloads, Nov 14): low-poly soldier, willys jeep, ww2 headwear, street lights, medieval houses, wooden bench, simple / picnic table, goose, gun targets, gorebox range props, shooting range target, Zeiss Terra scope, `assets-low-poly.zip` (242 MB, unchecked).

- Case models for shot shells (12 gauge) and the 20 mm Lahti case: both use the .30-06 case now. Ithaca 37 ejects downward (it throws right now).
- `tools/blender/packs/store.mjs` still defaults to the old flat store layout (the store is now sorted into `Weapons/`, `Vehicles/`, ...).

- Hand editor (key H, next to T): side silhouette of the gun (2D from the model's triangles), drag R / L hand circles onto it, arms as lines shoulder -> elbow -> hand with draggable elbow + shoulder; live on the first person arms; kept in the browser, exported to weapon.json `hands` via `npm run aim`. Replaces hiding the arms.
- Elbow / shoulder per pose (hip / aimed).
- Action steps after a shot: bolt / pump / lever guns get a "cycle" step after "shot" (bolt-open / bolt-close cues); per gun reload animations fixed by the owner.
- Reloads in detail: rounds into the magazine, magazine swap, stripper clips.
- Fatigue lowers recoil `control`.

## Shooting range (`@polywar/shooting-range`)
Imported from the owner's .blend (`tools/blender/packs/shooting-range.py`), view `range`. Ideas from the owner:
- [x] button to move the targets nearer / further (moving targets on the rails)
- [x] binoculars ("kikare") on the roof to look down the range
- [x] lamps
- [ ] gun per case picked on purpose (now: the first 15 of the loadout, in order)
- [ ] distance-marker numbers and the target face are textures: game-mesh draws one colour per face, so they are lost (model them, or textured draw). `Target(Square)` image points to a missing file in ~/Downloads
- [ ] booths are one mesh each: 973 face boxes; simpler collision if split into boxes in Blender
- [x] long range lane: 200..800 m (every 100), big zoom scope on a raised stand
- [ ] weapons gate / armory room with every gun on racks; WW2 French / British / US military feel
- [ ] proper trees (owner models), a tiny world round the range from the terrain packages (no ocean)
- [ ] surroundings from our own packages (grass, world / terrain): generate a small patch with background mountains, export to Blender and save; grass / trees placed by weight paint in the blend (controllable)
- [ ] the road down the range drivable (with the jeep)
- [x] grass from our grass package by range.json `grass` zones: tall on the fields + round the bunkers, short on the camp street / round the square, none under tents, buildings, roads
- [ ] mover: more than one floor per spot (now the highest ground triangle wins; the armory works only because the ground has a hole over it)
- [ ] flag: textured draw for the papit logo (now baked to face colours)
- [ ] tents / trees collision (decor now)

## World
- Save / load a generated world (skip generation): bake to a file / model, later pass over the network.
- Pistol two hand hold: support hand cups the grip hand (now palm up like a fore end); aimed the right forearm crosses the view (pistol held close, arms bent).
- Per gun hand frames (axis / palm / radius / finger targets) in weapon.json `hands`, set from the hand editor (H).
- Real textures in the renderer (owner OK): `game-mesh` draws base colour x COLOR_0 only, export bakes images into vertex colours (one colour per face). Bake writes sRGB pixels into Blender's linear colour slot: everything a bit pale (all models alike).
- New store characters (`tools/blender/packs/store_soldiers.py`, unrigged FBX -> base rig by landmarks + bone heat): allied has a few harness strap spikes at the sides (weighted on a voxel copy, bone heat fails on its mesh); landmarks eyeballed from renders.

## Cleanup
- [ ] Vec3 -> papit vector (271 uses in `packages/*/*/src`): plain tuple only for JSON data (weapon.json hands / points, Hold, HandsFile, aim tune; rename e.g. `Point3`); params take `VectorValue`; math + returns `Vector3` (viewmodel `point` / `direction`, obstruction, player, feel). Papit report: `Vector` has no `toJSON` (stringifies as `{"0":..}`); with one, the tuple type goes too.

## Vehicles
- [x] Drivable jeep: `~/Developer/3d/store/vehicles/willys-jeep-low-poly`. Wheels track the ground, soft long travel suspension (spring + damper per wheel, raycast wheels on `rigidbody`), steer / throttle / brake, enter / exit. Needs a plan first; nice physics can come later. Star decal (texture) later.

## Sky + weather
- [ ] Time of day: sun / moon move with the real local clock (13:00 is 13:00), time controllable (speed / set). Night fall, sun light colour + ambient follow it.
- [ ] Clouds: a nice cloud system; denser = greyer, leads to rain or snow by the biome's temperature.
- [ ] Light fog (distance + height), first in the shooting range.

## Weapon editor
- [ ] Better hold editing: see the fingers on the gun, control the grip per hand (pose / curl / wrist turn), not only sliders for the gun position. Ties into the hand editor (H) and hand pose clips.

## Optics / gun handling (follow ups)
- [ ] Put-down gun: real rigidbody drop (now a straight fall), hand IK to the grip on take back.
- [ ] Steel plates: ring sound on hit; metal cans as targets.
