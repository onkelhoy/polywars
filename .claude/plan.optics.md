# Optics + gun handling (confirmed, next context)
Rough first pass each; owner refines after. Shares pieces with jeep 7 / 8 (`.claude/plan.jeep.md`): do 1-2 first.

1. Camera focus (= jeep 8): reusable "look at this" mode; camera eases to a point / target, mouse nudges a little, springs back.
2. Put the gun down: before a spotting scope / binoculars (two hands), the rifle goes to the nearest wall / desk edge / ground; placed with a rigidbody, frozen once it settles, state kept. Pistols: holster later.
3. Spotting scope: bend to the eyepiece (camera focus), the scope body + surroundings stay visible, the round view blends in as the eye reaches it. Wheel zoom (done: 2-25x).
4. Binoculars same feel: raised with the hands, eyepiece view blends in, wheel zoom.
5. Take the gun back: walk / look at it, F, bend down, hand to the grip (same as jeep 7).
6. Sparks: shooting metal (cans, steel) throws sparks (`@polywar/impacts`), maybe metal cans as targets.

## Bug first
- Shooting a jeep crashed the game (owner, before 6 above). Check `fleet.cast` / bullet hit on a vehicle (`nearest(range.cast, fleet.cast)` in range main.js).

## Done this session (needs in-game check)
Doors (hall A box per face, mover top-of-drop fix), near plane 1 m while zoomed, bigger see-through scope / binocular overlay, wheel zoom, binocular prompt.
