# @polywar/ballistics

Bullets in flight and what they hit. No drawing (tracers, particles, marks: `@polywar/impacts`), no guns (`@polywar/weapons`).

- `Bullets(cast)`: `fire({ from, direction, speed, drag, life, tracer, data })`, `update(dt)` (fixed 1/240 s steps, gravity + quadratic drag, one `cast` per step), `onhit(bullet, hit)`, `ongone(bullet)`, `list` (position, previous, velocity, travelled, age).
- Casts (`(from, to) => Hit | null`, `Hit = { t, point, normal, surface?, target? }`): `castGround(height, from, to)`, `castBox`, `castSphere`, `castCylinder`, `nearest(...casts)`.
- `dropAt(speed, drag, distance)`, `timeAt(...)`, `zeroAngle(speed, drag, zero, sightHeight)`: how far up the bore points so the shot meets the sights at `zero`.

View `experiment`: every gun's trajectory zeroed, drop table.
