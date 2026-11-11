# @polywar/room

`<pw-room>` a game's waiting room: players (host, ready, ping), invite (`<pw-share>` dialog: QR, code, copy/share), ready, leave, reconnecting banner.
Host: lock, listed, max, kick, start (when everyone's ready, `all-ready="false"` to drop that).

```html
<pw-room>
    <game-rules slot="settings"></game-rules>
</pw-room>
```

```ts
room.game = net.game;
room.addEventListener("start", e => play(e.detail.game, e.detail.meta)); // every player
room.addEventListener("end", e => backToLobby(e.detail));               // EndReason
room.start(meta);                                                       // host, by code
```

Messages it uses: `room:ready`, `room:start`, `ping:*`.

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
