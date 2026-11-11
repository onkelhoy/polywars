# Known bugs

## papit
- `@papit/build --error` exits 1 without printing the error when `api-extractor` throws (e.g. `ReadonlyMap`/`Map` in a public type: "Unable to follow symbol"). No `bundle.d.ts`. Workaround: keep Map/ReadonlyMap out of public types.
- `@papit/build` skips a package when only its `.css` changed. Workaround: `npx @papit/build --force`.
- `@papit/webrtc` `rtt(peer)` is private (README says public). `@polywar/ping` measures over game messages instead.
- `html` binding on `<input type="number" value="${x}">` logs `"__marker__" cannot be parsed` warnings on first render.
- Whitespace between text and an element in `html` templates is dropped (`name <small>` → `name<small>`). Workaround: CSS margin.
