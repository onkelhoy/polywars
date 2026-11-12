# @polywar/viewport-camera

Camera controllers for `@papit/game-engine` cameras. Used by `pw-viewport` (and through it the asset preview, gallery and views).

- `panZoom({ pan, pivot, min, max, distance })`: left drag turns around the pivot, right / shift drag pans, wheel zooms.
  `pan: "screen"` (default in `pw-viewport`) moves in the view plane: full 3D. `pan: "ground"` slides over y = 0: in-game RTS style.
- `fly({ speed })`: click to look (Esc frees), WASD, E / Q up / down, shift fast, wheel speed.
- helpers: `forward`, `right`, `typing`.

View: `views/experiment`.
