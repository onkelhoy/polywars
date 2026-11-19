# Optics + gun handling (confirmed, next context)
Rough first pass each; owner refines after. Shares pieces with jeep 7 / 8 (`.claude/plan.jeep.md`): do 1-2 first.

1. [x] Camera focus (= jeep 8): reusable "look at this" mode; camera eases to a point / target, mouse nudges a little, springs back.
2. [x] Put the gun down: before a spotting scope / binoculars (two hands), the rifle goes to the nearest wall / desk edge / ground; placed with a rigidbody, frozen once it settles, state kept. Pistols: holster later.
3. [x] Spotting scope: bend to the eyepiece (camera focus), the scope body + surroundings stay visible, the round view blends in as the eye reaches it. Wheel zoom (done: 2-25x).
4. Binoculars same feel: raised with the hands, eyepiece view blends in, wheel zoom.
5. Take the gun back: walk / look at it, F, bend down, hand to the grip (same as jeep 7).
6. Sparks: shooting metal (cans, steel) throws sparks (`@polywar/impacts`), maybe metal cans as targets.

## Bug (fixed, check in game)
- Shooting a jeep crashed: `fleet.cast` now skips a chassis the ray starts inside (zero normal -> NaN).

## 1-3 notes (rough, check in game)
- `Focus` in `@polywar/viewmodel`; `player.focus.start({ eye, look })` / `stop()`.
- Put down: `player.putDown()` / `takeBack()` / `down`; kinematic drop (no rigidbody yet), laid on its side. F near it or its number key takes it back (instant: 5 adds the bend).
- Scope: F eases the eye to the eyepiece (.7 s), zoom + ring blend in over the last 40%; F eases back.

## Done this session (needs in-game check)
Doors (hall A box per face, mover top-of-drop fix), near plane 1 m while zoomed, bigger see-through scope / binocular overlay, wheel zoom, binocular prompt.
