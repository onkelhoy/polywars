import { connect } from '@polywar/net';

const $ = id => document.getElementById(id);
const log = (...args) => { $("log").textContent = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ") + "\n" + $("log").textContent; };

const net = window.net = connect();
$("name").value = net.profile.name;

net.on("status", status => { $("status").textContent = status; log("status", status); });
net.on("trying", trying => log("trying", trying));
net.on("error", error => log("error", error.reason));
net.on("game", game => {
    $("game").textContent = game ? `${game.code} (${game.isHost ? "host" : "guest"}) ${net.invite()?.link}` : "-";
    if (!game) return;
    game.on("join", ({ player }) => log("join", player.profile.name));
    game.on("leave", ({ player, reason }) => log("leave", player.profile.name, reason));
    game.on("end", reason => log("end", reason));
    game.onMessage("hello", (data, from) => log("hello from", game.player(from)?.profile.name ?? from));
});
$("status").textContent = net.status;

$("name").onchange = () => net.setProfile({ name: $("name").value });
$("host").onclick = () => net.host({ name: `${net.profile.name}'s game`, public: true }).catch(e => log("host failed", e.message));
$("join").onclick = () => net.join($("code").value).catch(e => log("join failed", e.reason ?? e.message));
$("leave").onclick = () => net.leave();
$("list").onclick = async () => log("games", await net.games());
$("hello").onclick = () => net.game?.broadcast("hello");

net.start().then(game => game && log("started in", game.code));
