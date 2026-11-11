import type { Game, GameError, GameListing, GameOptions, LobbyPlayer, Profile, Timing, Trying } from "@papit/game-network";

/**
 * - `connecting` / `waking` (free signal server booting) / `ready` / `failed` (retrying on its own): the lobby
 * - `reconnecting`: getting back into a game (after a reload or a drop), `cancel()` gives up
 */
export type NetStatus = "connecting" | "waking" | "ready" | "failed" | "reconnecting";

export type NetOptions = {
    /** Default `?signal=` or `DEFAULT_SIGNAL`. */
    signal?: string;
    /** Default `polywar`. Other apps get other lobbies. */
    app?: string;
    /** Bump when messages change: other versions get their own lobby. Default 1. */
    version?: number;
    /** List games and players. Default true. */
    lobby?: boolean;
    /** Default: saved in `localStorage`, else a random name. */
    profile?: Profile;
    /** Extra TURN servers. */
    turn?: RTCIceServer[];
    timing?: Partial<Timing>;
    /** Where the last game is remembered for reloads. Default `sessionStorage`, `null` turns resume off. */
    storage?: Storage | null;
};

export type Invite = { code: string; link: string };

export type NetEvents = {
    status: NetStatus;
    game: Game | null;
    /** A join or resume still trying: tries, ms left. */
    trying: Trying;
    /** A join from an invite link or a resume that failed. */
    error: GameError;
    profile: Profile;
};

export type HostOptions = GameOptions;
export type { Game, GameError, GameListing, LobbyPlayer, Profile, Trying };
