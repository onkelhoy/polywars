# @polywar/viewport-camera

Camera controllers for `@papit/game-engine` cameras. Used by `pw-viewport` (and through it the asset preview, gallery and views).

- `panZoom({ pan, pivot, min, max, distance })`: left drag turns around the pivot, right / shift drag pans, wheel zooms.
  `pan: "screen"` (default in `pw-viewport`) moves in the view plane: full 3D. `pan: "ground"` slides over y = 0: in-game RTS style.
- `fly({ speed })`: click to look (Esc frees), WASD, E / Q up / down, shift fast, wheel speed.
- `walk({ ground, ... })`: first person on foot (WASD, mouse look, shift run, space jump).
- Touch: `fly` / `walk` take `touch: TouchInput` (`stick` {x, y}, `buttons` by name with `pressed`; `@papit/joystick` fits, no dependency), a finger on the canvas looks. `panZoom`: one finger turns, two pan + pinch zoom.
- helpers: `forward`, `right`, `typing`.

View: `views/experiment`.
