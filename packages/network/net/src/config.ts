export const APP = "polywar";
/** Same free signal server as arrow-warfare (sleeps when idle: status `waking` while it boots). */
export const DEFAULT_SIGNAL = "wss://render-webrtc-signal-server.onrender.com";

/**
 * TURN relays a connection only when a direct one can't be made (strict mobile or company networks).
 * Empty until credentials are added: `{ urls, username, credential }`.
 */
export const TURN: RTCIceServer[] = [];
export const STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

/** `?signal=ws://localhost:3599` points the game at a local signal server. Invite links keep it. */
export function signalUrl(search: string = location.search) {
    return new URLSearchParams(search).get("signal") || DEFAULT_SIGNAL;
}

export function rtcConfig(turn: RTCIceServer[] = TURN): RTCConfiguration {
    return { iceServers: [...STUN, ...turn] };
}
