# Jeep, iteration 2 (confirmed, `feature/jeep`)
Rough first pass each; owner refines after.

1. [x] Glass: clear panes + a few thin white streaks (own see-through part). Streaks only if the renderer can't blend.
2. [x] Gears: automatic 3-speed (rpm, ratios, short power cut per shift, engine braking). Top speed 105 km/h default (real Willys MB), `boost` setting for 150+.
3. Engine sound: generated loop, pitch / volume follow rpm, dip + rise on shifts, idle at a stop, handbrake skid. papit `audio` (3D).
4. Car collisions: all vehicles in one shared world (jeeps hit each other), bullets hit jeeps. Tents later.
5. Dust: dirt / gravel puffs behind the wheels, more with speed + slip, coloured by the ground.
6. Driver seated: character sitting at the seat, hands on the rim by IK; each hand follows about one turn, then lets go and grabs again further round.
7. Gun on the passenger seat: getting in puts it there; getting out you lean over and take it (hand to the gun's grip).
8. Camera focus: reusable "look at this" mode for short moments; mouse nudges a little, springs back to the target. Used for the grab in 7.
