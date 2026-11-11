# @polywar/lobby

`<pw-lobby>` the lobby browser: status, my name, join by code or by scanning a QR (`<pw-share>`, password when asked), host form, public games, who's online.

```ts
const lobby = document.querySelector("pw-lobby");
lobby.net = connect();             // @polywar/net
lobby.meta = { map: "village" };   // goes to host({ meta })
lobby.addEventListener("game", e => showRoom(e.detail));
```

Events: `game` (`Game`), `error` (`GameError`).

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
