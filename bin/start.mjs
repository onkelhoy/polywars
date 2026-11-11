// npm start: dev server + local signal server.
//   SIGNAL=wss://render-webrtc-signal-server.onrender.com npm start   → no local signal server, the page opens with ?signal=
//   SIGNAL_PORT=3599 (default)    extra args go to @papit/server
import { spawn } from "node:child_process";
import net from "node:net";

const remote = process.env.SIGNAL;
const port = Number(process.env.SIGNAL_PORT || 3599);
const children = [];

const run = (command, args) => {
    const child = spawn(command, args, { stdio: "inherit", shell: true, env: process.env, detached: true });
    children.push(child);
    child.on("exit", code => { if (code) stop(code); });
    return child;
};

const busy = port => new Promise(resolve => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
});

function stop(code = 0) {
    // detached: each child leads its own group, so npx and what it started go together
    for (const child of children) try { process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ }
    process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

const server = ["@papit/server", "--serve", "--info", ...process.argv.slice(2)];
if (remote)
{
    console.log(`signal: ${remote}`);
    server.push(`--open=/?signal=${encodeURIComponent(remote)}`);
}
else if (await busy(port)) console.log(`signal: ws://localhost:${port} (already running)`);
else
{
    console.log(`signal: ws://localhost:${port}`);
    run("npx", ["papit-signal-server", "--port", String(port)]);
}
run("npx", server);
