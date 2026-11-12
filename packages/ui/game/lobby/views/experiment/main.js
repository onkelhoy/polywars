import { connect } from "@polywar/net";
import "@polywar/lobby";

// npm start, then two tabs
const net = window.net = connect();
const lobby = document.querySelector("pw-lobby");
lobby.net = net;
lobby.addEventListener("game", event => {
    const game = event.detail;
    document.getElementById("out").textContent = `in game ${game.code} as ${game.isHost ? "host" : "guest"}: ${net.invite()?.link}`;
});
net.start();
