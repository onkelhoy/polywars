# @polywar/net

Polywar's network. One `connect()` over [`@papit/game-network`](https://github.com/onkelhoy/papit/tree/main/packages/network/game-network):
lobby, games by code, resume after reload, host hand-off, retries. Adds one status, a saved profile, invite helpers and `start()`.

```ts
import { connect } from "@polywar/net";

const net = connect();                  // app "polywar", ?signal= or the default server
net.on("status", s => {});             // connecting | waking | ready | failed | reconnecting
net.on("game", game => {});            // Game | null: swap lobby ↔ room
net.on("error", e => e.reason);        // a failed invite join / resume
await net.start();                      // resume a reload, else join ?g=CODE from the address

await net.host({ name: "Ada's game", public: true, max: 16, password, meta });
await net.join("K7QF2M", { password }); // rejects with GameError(reason)
net.invite();                           // { code, link } → QR / share
net.games(); net.players();             // lobby lists
net.setProfile({ name: "Ada" });        // saved in localStorage
net.cancel(); net.leave(); net.close();

net.game.broadcast("move", { x: 1 });   // the papit Game, see game-network
net.game.onMessage("move", (data, from) => {});
```

Local: `npm run signal` (root, port 3599), then open any view with `?signal=ws://localhost:3599`.

| Option | Default |
| --- | --- |
| `signal` | `?signal=` or `DEFAULT_SIGNAL` |
| `app` / `version` | `polywar` / `1` |
| `lobby` | `true` |
| `profile` | saved or `Soldier <n>` |
| `turn` | `TURN` (empty: add credentials in `config.ts`) |
| `timing`, `storage` | game-network defaults |

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.
