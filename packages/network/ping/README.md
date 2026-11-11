# @polywar/ping

Round trip to every other player of a game, over a `ping` / `pong` message pair. Start one on every peer.

```ts
import { Ping } from "@polywar/ping";

const ping = new Ping(game, { every: 2000, weak: 250 });
ping.onChange(stats => {});   // [{ id, rtt, last, weak, lost }]
ping.of(id); ping.stop();
```

Works with any object shaped like `PingTarget` (`me`, `players`, `send`, `onMessage`). papit's webrtc `rtt` is private, hence this.

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.
