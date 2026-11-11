// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { inviteLink, withoutInvite, type Game, type Player, type Trying } from "@papit/game-network";
import { Ping, type PingStat } from "@polywar/ping";
import "@papit/button";
import "@polywar/share";

// local
import sheet from "./style.css" with { type: "css" };

const READY = "room:ready";
const START = "room:start";

/**
 * The waiting room of a game: who's in (host, ready, ping), invite, ready toggle, and host controls
 * (lock, listed, max, kick, start). Game rules go in the `settings` slot.
 *
 * @element pw-room
 *
 * @property {Game} game the game from `@papit/game-network` / `@polywar/net` (property only)
 * @property {string} link invite link. Default: this page with `?g=<code>`
 * @property {boolean} all-ready host can only start when everyone is ready. Default true
 *
 * @slot settings game rules, shown to everyone (the game decides who may edit)
 *
 * @fires start every player, when the host starts. `detail: { game }`
 * @fires leave after I left with the Leave button
 * @fires end `CustomEvent<EndReason>` the game ended (kicked, host left, …)
 */
export class Room extends CustomElement {
    static sheet = sheet;

    @property({ attribute: false, after: function (this: Room) { this.hook(); } }) game: Game | null = null;
    @property({ type: String, rerender: true }) link: string = "";
    @property({ type: Boolean, attribute: "all-ready" }) allReady: boolean = true;

    @query("pw-share") private invite?: HTMLElement & { open(): void };

    private ready = new Map<string, boolean>();
    private pings = new Map<string, PingStat>();
    private trying: Trying | null = null;
    private ping: Ping | null = null;
    private off: (() => void)[] = [];

    connectedCallback() {
        super.connectedCallback?.();
        this.hook();
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        this.unhook();
    }

    /** Who's ready, by player id. */
    get readiness(): Record<string, boolean> {
        return Object.fromEntries(this.ready);
    }

    // ------------------------------------------------------------------ game

    private hook() {
        this.unhook();
        const game = this.game;
        if (!game || !this.isConnected) return;
        this.ready.clear();
        this.trying = null;

        this.ping = new Ping(game);
        this.off.push(
            () => this.ping?.stop(),
            this.ping.onChange(stats => {
                this.pings = new Map(stats.map(stat => [stat.id, stat]));
                this.requestUpdate();
            }),
            game.onMessage(READY, (data, from) => {
                this.ready.set(from, !!data?.ready);
                this.requestUpdate();
            }),
            game.onMessage(START, (data, from) => {
                if (from !== game.host) return;
                this.fire("start", { game, meta: data?.meta });
            }),
            game.on("join", ({ player, previous }) => {
                if (previous && this.ready.has(previous))
                {
                    this.ready.set(player.id, this.ready.get(previous)!);
                    this.ready.delete(previous);
                }
                // newcomers learn my state
                game.send(player.id, READY, { ready: this.mine });
                this.requestUpdate();
            }),
            game.on("leave", ({ player }) => {
                this.ready.delete(player.id);
                this.requestUpdate();
            }),
            game.on("update", () => this.requestUpdate()),
            game.on("host", () => this.requestUpdate()),
            game.on("reconnecting", trying => { this.trying = trying; this.requestUpdate(); }),
            game.on("reconnected", () => {
                this.trying = null;
                game.broadcast(READY, { ready: this.mine });
                this.requestUpdate();
            }),
            game.on("end", reason => {
                this.unhook();
                this.fire("end", reason);
            }),
        );
        this.requestUpdate();
    }

    private unhook() {
        this.off.forEach(off => off());
        this.off = [];
        this.ping = null;
    }

    private fire(type: string, detail?: unknown) {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }

    private get mine() {
        return !!this.game && !!this.ready.get(this.game.me);
    }

    private get everyoneReady() {
        const game = this.game;
        if (!game) return false;
        return game.players.every(player => player.id === game.me || this.ready.get(player.id));
    }

    // ------------------------------------------------------------------ handlers

    @bind
    private handleReady() {
        const game = this.game;
        if (!game) return;
        const ready = !this.mine;
        this.ready.set(game.me, ready);
        game.broadcast(READY, { ready });
        this.requestUpdate();
    }

    /** Starts the game for everyone (host only). `meta` goes along to every `start` event. */
    start(meta?: unknown) {
        const game = this.game;
        if (!game?.isHost) return;
        game.broadcast(START, { meta });
        this.fire("start", { game, meta });
    }

    @bind
    private handleStart() {
        this.start();
    }

    @bind
    private handleLeave() {
        this.game?.leave();
        this.fire("leave");
    }

    @bind
    private handleLock() {
        this.game?.lock(!this.game.info.locked);
    }

    @bind
    private handlePublic(event: Event) {
        this.game?.update({ public: (event.target as HTMLInputElement).checked });
    }

    @bind
    private handleMax(event: Event) {
        const max = Number((event.target as HTMLInputElement).value);
        if (max >= 2) this.game?.update({ max });
    }

    @bind
    private handleKick(event: Event) {
        const id = (event.target as HTMLElement).closest<HTMLElement>("[data-kick]")?.dataset.kick;
        if (id) this.game?.kick(id);
    }

    @bind
    private handleInvite() {
        this.invite?.open();
    }

    // ------------------------------------------------------------------ render

    private renderPlayer(game: Game, player: Player) {
        const me = player.id === game.me;
        const ping = this.pings.get(player.id);
        const ready = this.ready.get(player.id);
        return html`
            <li key="${player.id}" class="${me ? "mine" : ""}">
                <span class="name">${player.profile.name ?? player.id}${me ? " (you)" : ""}${player.host ? html` <small class="badge">host</small>` : ""}</span>
                <span class="ready" title="ready">${ready ? "✓" : ""}</span>
                <span class="ping ${ping?.weak ? "weak" : ""}">${me ? "" : ping?.rtt != null ? `${ping.rtt} ms${ping.weak ? " ⚠" : ""}` : "…"}</span>
                ${game.isHost && !me ? html`<pap-button size="small" variant="clear" data-kick="${player.id}">Kick</pap-button>` : ""}
            </li>
        `;
    }

    render() {
        const game = this.game;
        if (!game) return null;
        const info = game.info;
        const link = this.link || inviteLink(game.code, withoutInvite(location.href));
        const canStart = !this.allReady || this.everyoneReady;

        return html`
            <header>
                <div>
                    <h2>${info.name}</h2>
                    <p class="sub">Code <b class="code">${game.code}</b> · ${game.players.length}/${info.max}${info.locked ? " · locked" : ""}${info.password ? " · 🔒" : ""}</p>
                </div>
                <pap-button size="small" variant="outline" @click="${this.handleInvite}">Invite</pap-button>
            </header>

            ${this.trying ? html`<p class="reconnecting" role="status">Reconnecting… try ${this.trying.tries}, ${Math.ceil(this.trying.left / 1000)} s left</p>` : ""}

            <ul class="players" @click="${this.handleKick}">
                ${game.players.map(player => this.renderPlayer(game, player))}
            </ul>

            <div class="settings"><slot name="settings"></slot></div>

            ${game.isHost ? html`
                <div class="host">
                    <pap-button size="small" variant="outline" @click="${this.handleLock}">${info.locked ? "Unlock" : "Lock"}</pap-button>
                    <label><input type="checkbox" ${info.public && "checked"} @change="${this.handlePublic}" /> Listed</label>
                    <label>Max <input type="number" min="2" max="64" value="${info.max}" @change="${this.handleMax}" /></label>
                </div>
            ` : ""}

            <footer>
                <pap-button variant="outline" @click="${this.handleLeave}">Leave</pap-button>
                <pap-button variant="${this.mine ? "filled" : "outline"}" @click="${this.handleReady}">${this.mine ? "Ready ✓" : "Ready"}</pap-button>
                ${game.isHost ? html`<pap-button @click="${this.handleStart}" ${!canStart && "disabled"}>Start</pap-button>` : ""}
            </footer>

            <pw-share dialog code="${game.code}" link="${link}" no-scan></pw-share>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-room": Room;
    }
}
