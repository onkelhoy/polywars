import { connect } from "@polywar/net";
import "@polywar/lobby";
import "@polywar/room";

// npm start, then two tabs
const net = window.net = connect();
const lobby = document.querySelector("pw-lobby");
const room = document.querySelector("pw-room");
const log = text => document.getElementById("out").textContent = text;

lobby.net = net;
net.on("game", game => {
    lobby.hidden = !!game;
    room.hidden = !game;
    room.game = game;
});
room.addEventListener("start", event => log(`started: ${event.detail.game.code}`));
room.addEventListener("end", event => log(`ended: ${event.detail}`));
net.start();
