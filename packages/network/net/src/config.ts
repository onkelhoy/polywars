export const APP = "polywar";
/** Same free signal server as arrow-warfare (sleeps when idle: status `waking` while it boots). Used on the hosted site. */
export const DEFAULT_SIGNAL = "wss://render-webrtc-signal-server.onrender.com";
/** `npm start` runs a local signal server here (`SIGNAL_PORT`). */
export const DEV_SIGNAL_PORT = 3599;

/**
 * TURN relays a connection only when a direct one can't be made (strict mobile or company networks).
 * Empty until credentials are added: `{ urls, username, credential }`.
 */
export const TURN: RTCIceServer[] = [];
export const STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const KEY = "polywar:signal";

/**
 * The signal server, first match wins:
 * 1. `?signal=wss://…` in the address (kept for the tab, so other pages and reloads use it too)
 * 2. one kept from 1 earlier in this tab
 * 3. served from localhost or the LAN (dev, phones on wifi): `ws://<host>:3599`
 * 4. `DEFAULT_SIGNAL`
 */
export function signalUrl(page: Location | URL = location) {
    const asked = new URLSearchParams(page.search).get("signal");
    if (asked)
    {
        remember(asked);
        return asked;
    }
    const kept = recall();
    if (kept) return kept;
    if (isDev(page.hostname)) return `ws://${page.hostname.includes(":") ? `[${page.hostname}]` : page.hostname}:${DEV_SIGNAL_PORT}`;
    return DEFAULT_SIGNAL;
}

/** localhost, *.local, or a private network address. */
export function isDev(hostname: string) {
    const host = hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
    const ip = host.split(".").map(Number);
    if (ip.length !== 4 || ip.some(Number.isNaN)) return false;
    return ip[0] === 127 || ip[0] === 10 || (ip[0] === 192 && ip[1] === 168) || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31);
}

export function rtcConfig(turn: RTCIceServer[] = TURN): RTCConfiguration {
    return { iceServers: [...STUN, ...turn] };
}

function remember(url: string) {
    try { sessionStorage.setItem(KEY, url); } catch { /* fine */ }
}

function recall() {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
}
