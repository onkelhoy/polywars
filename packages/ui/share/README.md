# @polywar/share

`<pw-share>` everything for sharing a game: QR code of the link, the code in big letters, Share (phone share sheet) / Copy link, and Scan code (opens the camera, rear one on phones, reads someone's QR).

```html
<pw-share code="K7QF2M" link="https://…/?g=K7QF2M"></pw-share>  <!-- host: QR + share + scan -->
<pw-share></pw-share>                                          <!-- lobby: scan only -->
<pw-share dialog no-scan></pw-share>                          <!-- modal: open() / close() -->
```

```ts
share.addEventListener("scan", e => net.join(e.detail.code)); // { text, code }; code null only with any-code
```

| Attribute | |
| --- | --- |
| `link`, `code` | what to share / show |
| `dialog`, `header` | modal mode |
| `no-scan` | hide Scan (it's also hidden without a camera) |
| `any-code` | `scan` for any QR, not only game codes |
| `param` | query parameter of the code in a link, default `g` |

Events: `scan`, `shared` (`{ link, via }`), `camera-error` (`denied | missing | failed`).
Scanning: `BarcodeDetector` where the browser has it, else bundled jsQR 1.4.0 (Apache-2.0, `src/vendor`). Frames never leave the browser.


## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.

## Related Components

- [@papit/web-component](https://github.com/onkelhoy/papit/tree/main/packages/web/engines/web-component): Core utilities, decorators, and base component class
