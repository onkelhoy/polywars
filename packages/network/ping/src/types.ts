/** What ping needs from a game: `@papit/game-network`'s `Game` fits, anything else with the same shape does too. */
export type PingTarget = {
    readonly me: string;
    readonly players: readonly { id: string }[];
    send(to: string, type: string, data?: unknown): void;
    onMessage(type: string, handler: (data: any, from: string, type: string) => void): () => void;
};

export type PingOptions = {
    /** ms between rounds. Default 2000. */
    every?: number;
    /** Round trip above this (ms) is weak. Default 250. */
    weak?: number;
    /** Samples averaged. Default 5. */
    samples?: number;
    /** No pong for this long (ms) counts as lost. Default 5000. */
    timeout?: number;
    /** Message type prefix, so it can't clash with game messages. Default `ping`. */
    type?: string;
};

export type PingStat = {
    id: string;
    /** Average round trip in ms, null before the first pong. */
    rtt: number | null;
    /** Last round trip in ms. */
    last: number | null;
    weak: boolean;
    /** Pings without a pong since the last one that came back. */
    lost: number;
};
