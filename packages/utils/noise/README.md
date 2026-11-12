# @polywar/noise

Seeded noise, pure math, no rendering.

- `simplex(seed)`, `value(seed)`: `(x, y) => -1..1`
- `fbm(noise, x, y, { octaves, lacunarity, gain })`: fractal sum, -1..1
- `ridged(noise, x, y, { sharpness })`: mountain crests, 0..1
- `billow(noise, x, y)`: puffy hills, 0..1
- `warp(noise, x, y, strength)`: domain warped point
- `tileable(size, period, seed)`: seamless fractal bytes (grass noise texture)

View: `views/experiment`.
