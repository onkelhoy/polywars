import { Ping } from '@polywar/ping';

// a tiny in-page "game" for two players
function fake(me, other, delay) {
    const handlers = new Map();
    const peer = {
        me,
        players: [{ id: "a" }, { id: "b" }],
        send: (to, type, data) => setTimeout(() => other().deliver(type, data, me), delay()),
        onMessage: (type, handler) => { handlers.set(type, handler); return () => handlers.delete(type); },
        deliver: (type, data, from) => handlers.get(type)?.(data, from, type),
    };
    return peer;
}
const a = fake("a", () => b, () => 20);
const b = fake("b", () => a, () => 50 + Math.random() * 300);

const ping = new Ping(a, { every: 1000 });
new Ping(b, { every: 1000 });
ping.onChange(stats => document.getElementById("out").textContent = JSON.stringify(stats, null, 2));
