import { GameError, GameNetwork, parseInvite, withoutInvite, type GameOptions, type JoinOptions, type Profile } from "@papit/game-network";

import { APP, rtcConfig, signalUrl } from "./config";
import { loadProfile, saveProfile } from "./profile";
import type { Invite, NetEvents, NetOptions, NetStatus } from "./types";

type Handler<T> = (detail: T) => void;

/**
 * Polywar's one network object. Wraps `GameNetwork` (lobby, games by code, resume, host hand-off) and adds:
 * one status, a saved profile, invite helpers and `start()` (resume a reload, or follow an invite link).
 * `net.network` is the full `GameNetwork` when more is needed.
 */
export class Net {
    readonly network: GameNetwork;
    private handlers = new Map<keyof NetEvents, Set<Handler<any>>>();
    private _status: NetStatus = "connecting";
    private _profile: Profile;
    /** A join or a game is finding its way back. */
    private trying = false;

    constructor(options: NetOptions = {}) {
        this._profile = options.profile ?? loadProfile();
        this.network = new GameNetwork({
            signal: options.signal ?? signalUrl(),
            app: options.app ?? APP,
            version: options.version,
            lobby: options.lobby ?? true,
            profile: this._profile,
            rtc: rtcConfig(options.turn),
            timing: options.timing,
            storage: options.storage,
        });
        this._status = this.network.status;

        this.network.addEventListener("status", () => this.refresh());
        this.network.addEventListener("trying", event => {
            this.onTrying((event as CustomEvent).detail);
        });
        this.network.addEventListener("game", event => {
            const game = (event as CustomEvent).detail;
            if (game)
            {
                game.on("reconnecting", (trying: NetEvents["trying"]) => this.onTrying(trying));
                game.on("reconnected", () => this.settle());
                game.on("end", () => this.settle());
            }
            this.refresh();
            this.emit("game", game);
        });
    }

    // ------------------------------------------------------------------ state

    get status() { return this._status; }
    get game() { return this.network.game; }
    get ready() { return this.network.ready; }
    get profile() { return this._profile; }

    /** Changes and saves my profile, shown in the lobby and to new players. */
    setProfile(profile: Profile) {
        this._profile = { ...this._profile, ...profile };
        saveProfile(this._profile);
        this.network.setProfile(this._profile);
        this.emit("profile", this._profile);
    }

    // ------------------------------------------------------------------ games

    /**
     * What to do on page load: back into the game of before a reload, else the game of an invite link
     * in the address. Null when neither. Failures come as `error` events, not rejections.
     */
    async start(page: string = location.href) {
        try
        {
            if (this.network.last) return await this.network.resume();
            const code = parseInvite(new URL(page).search);
            if (code) return await this.join(code);
        }
        catch (error)
        {
            if (error instanceof GameError) this.emit("error", error);
            else throw error;
        }
        finally
        {
            clearInviteFromAddress();
            this.settle();
        }
        return null;
    }

    host(options: GameOptions) {
        return this.network.createGame(options);
    }

    /** Rejects with a `GameError`: `not-found`, `full`, `locked`, `password`, `kicked`, `gone`, `left`. */
    join(code: string, options: Omit<JoinOptions, "onTrying"> = {}) {
        return this.network.joinGame(code, {
            ...options,
            onTrying: trying => this.onTrying(trying),
        }).finally(() => this.settle());
    }

    leave() {
        this.network.leaveGame();
    }

    /** Stops a join or resume that's still trying. */
    cancel() {
        this.network.cancel();
        this.settle();
    }

    games() { return this.network.listGames(); }
    players() { return this.network.listPlayers(); }

    /** Code and link of my game (or `code`), for a QR code or share button. Null when not in a game. */
    invite(code = this.game?.code): Invite | null {
        if (!code) return null;
        return { code, link: this.network.inviteLink(code, withoutInvite(location.href)) };
    }

    close() {
        this.network.close();
        this.handlers.clear();
    }

    // ------------------------------------------------------------------ events

    /** Returns the unsubscribe. */
    on<K extends keyof NetEvents>(event: K, handler: Handler<NetEvents[K]>) {
        let set = this.handlers.get(event);
        if (!set) this.handlers.set(event, set = new Set());
        set.add(handler);
        return () => { set!.delete(handler); };
    }

    private emit<K extends keyof NetEvents>(event: K, detail: NetEvents[K]) {
        for (const handler of this.handlers.get(event) ?? []) handler(detail);
    }

    private onTrying(trying: NetEvents["trying"]) {
        this.trying = true;
        this.refresh();
        this.emit("trying", trying);
    }

    private settle() {
        this.trying = false;
        this.refresh();
    }

    private refresh() {
        const next: NetStatus = this.trying || this.network.reconnecting ? "reconnecting" : this.network.status;
        if (next === this._status) return;
        this._status = next;
        this.emit("status", next);
    }
}

/** The one-liner: `const net = connect(); await net.start();` */
export function connect(options?: NetOptions) {
    return new Net(options);
}

/** Drops `?g=` from the address bar, so a reload doesn't re-join a game we left. */
export function clearInviteFromAddress() {
    if (typeof history === "undefined" || !parseInvite()) return;
    history.replaceState(history.state, "", withoutInvite(location.href));
}

export { parseInvite as inviteFromAddress };
