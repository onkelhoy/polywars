// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import "@papit/button";
import type { Game, GameError, GameListing, LobbyPlayer, Net, NetStatus } from "@polywar/net";

// local
import sheet from "./style.css" with { type: "css" };

const POLL = 3000;

const STATUS: Record<NetStatus, string> = {
    connecting: "Connecting…",
    waking: "Waking the server up (can take ~30 s)…",
    ready: "Online",
    failed: "Can't reach the server, retrying…",
    reconnecting: "Getting back into the game…",
};

const REASON: Record<string, string> = {
    "not-found": "No game with that code.",
    full: "That game is full.",
    locked: "That game is locked.",
    password: "Wrong or missing password.",
    kicked: "You were kicked from that game.",
    gone: "Lost the connection.",
    left: "Cancelled.",
    "host-left": "The host closed the game.",
};

/**
 * The lobby browser: connection status, my name, join by code, host a game, public games and who's online.
 * Give it a `Net` from `@polywar/net`. It hosts and joins itself, then fires `game`; the page swaps to the room.
 *
 * @element pw-lobby
 *
 * @property {Net} net the network (property only)
 * @property {object} meta game settings passed to `host()` as `meta` (property only)
 * @property {number} max default max players in the host form
 *
 * @fires game `CustomEvent<Game>` after hosting or joining
 * @fires error `CustomEvent<GameError>` a join or host that failed (also shown inline)
 */
export class Lobby extends CustomElement {
    static sheet = sheet;

    @property({ attribute: false, after: function (this: Lobby) { this.hook(); } }) net: Net | null = null;
    @property({ attribute: false }) meta: Record<string, unknown> = {};
    @property({ type: Number }) max: number = 16;

    private games: GameListing[] = [];
    private players: LobbyPlayer[] = [];
    private message = "";
    private busy = false;
    /** The code that asked for a password. */
    private needsPassword = "";
    private timer: ReturnType<typeof setInterval> | undefined;
    private unhook: (() => void)[] = [];

    connectedCallback() {
        super.connectedCallback?.();
        this.hook();
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        this.unhookAll();
    }

    // ------------------------------------------------------------------ net

    private hook() {
        this.unhookAll();
        const net = this.net;
        if (!net || !this.isConnected) return;
        this.unhook.push(
            net.on("status", () => { this.poll(); this.requestUpdate(); }),
            net.on("profile", () => this.requestUpdate()),
            net.on("game", () => this.requestUpdate()),
            net.on("error", error => this.fail(error)),
        );
        this.timer = setInterval(this.poll, POLL);
        this.poll();
    }

    private unhookAll() {
        this.unhook.forEach(off => off());
        this.unhook = [];
        clearInterval(this.timer);
    }

    @bind
    private async poll() {
        const net = this.net;
        if (!net || net.status !== "ready" || document.hidden) return;
        try
        {
            [this.games, this.players] = await Promise.all([net.games(), net.players()]);
            this.requestUpdate();
        }
        catch { /* lobby moved under us, next poll */ }
    }

    private async run(action: () => Promise<Game>) {
        if (this.busy) return;
        this.busy = true;
        this.message = "";
        this.requestUpdate();
        try
        {
            const game = await action();
            this.needsPassword = "";
            this.dispatchEvent(new CustomEvent("game", { detail: game, bubbles: true, composed: true }));
        }
        catch (error)
        {
            this.fail(error as GameError);
        }
        finally
        {
            this.busy = false;
            this.requestUpdate();
        }
    }

    private fail(error: GameError) {
        this.message = REASON[error?.reason] ?? String(error?.message ?? error);
        this.dispatchEvent(new CustomEvent("error", { detail: error, bubbles: true, composed: true }));
        this.requestUpdate();
    }

    // ------------------------------------------------------------------ handlers

    private field(form: HTMLFormElement, name: string) {
        return (form.elements.namedItem(name) as HTMLInputElement | null)?.value?.trim() ?? "";
    }

    @bind
    private handleName(event: Event) {
        const name = (event.target as HTMLInputElement).value.trim();
        if (name) this.net?.setProfile({ name });
    }

    @bind
    private handleJoin(event: SubmitEvent) {
        event.preventDefault();
        const form = event.target as HTMLFormElement;
        const code = this.field(form, "code");
        const password = this.field(form, "password") || undefined;
        if (code) this.join(code, password);
    }

    private join(code: string, password?: string) {
        const net = this.net;
        if (!net) return;
        this.run(async () => {
            try { return await net.join(code, { password }); }
            catch (error)
            {
                if ((error as GameError).reason === "password") this.needsPassword = code;
                throw error;
            }
        });
    }

    @bind
    private handleHost(event: SubmitEvent) {
        event.preventDefault();
        const form = event.target as HTMLFormElement;
        const net = this.net;
        if (!net) return;
        const name = this.field(form, "name") || `${net.profile.name ?? "Someone"}'s game`;
        const max = Number(this.field(form, "max")) || this.max;
        const password = this.field(form, "password") || undefined;
        const open = (form.elements.namedItem("public") as HTMLInputElement).checked;
        this.run(() => net.host({ name, max, password, public: open, meta: this.meta }));
    }

    @bind
    private handleList(event: Event) {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-code]");
        const code = button?.dataset.code;
        if (!code) return;
        const listing = this.games.find(game => game.code === code);
        if (listing?.password && this.needsPassword !== code)
        {
            this.needsPassword = code;
            this.requestUpdate();
            return;
        }
        const password = (this.shadowRoot?.querySelector<HTMLInputElement>(`input[data-password="${code}"]`)?.value) || undefined;
        this.join(code, password);
    }

    @bind
    private handleCancel() {
        this.net?.cancel();
    }

    // ------------------------------------------------------------------ render

    private renderGame(game: GameListing) {
        const asking = this.needsPassword === game.code;
        return html`
            <li key="${game.code}" class="game">
                <span class="name">${game.password ? "🔒 " : ""}${game.name}</span>
                <span class="count">${game.players}/${game.max}</span>
                ${asking ? html`<input data-password="${game.code}" type="password" placeholder="password" aria-label="password" />` : ""}
                <pap-button size="small" variant="outline" data-code="${game.code}" ${(this.busy || game.players >= game.max) && "disabled"}>Join</pap-button>
            </li>
        `;
    }

    render() {
        const net = this.net;
        if (!net) return html`<p class="status">No network.</p>`;
        const status = net.status;
        const me = net.network.lobby.network?.me;
        const others = this.players.filter(player => player.id !== me);

        return html`
            <header>
                <p class="status" data-status="${status}" role="status"><i></i>${STATUS[status]}</p>
                ${status === "reconnecting" ? html`<pap-button size="small" variant="clear" @click="${this.handleCancel}">Cancel</pap-button>` : ""}
                <label class="me">Name <input name="me" value="${net.profile.name ?? ""}" maxlength="24" @change="${this.handleName}" /></label>
            </header>

            ${this.message ? html`<p class="message" role="alert">${this.message}</p>` : ""}

            <div class="columns">
                <section class="games">
                    <h2>Games</h2>
                    <form class="join" @submit="${this.handleJoin}">
                        <input name="code" placeholder="CODE" aria-label="game code" maxlength="8" autocomplete="off" />
                        ${this.needsPassword && !this.games.some(game => game.code === this.needsPassword) ? html`<input name="password" type="password" placeholder="password" aria-label="password" />` : ""}
                        <pap-button size="small" type="submit" ${this.busy && "disabled"}>Join</pap-button>
                    </form>
                    <ul class="list" @click="${this.handleList}">
                        ${this.games.map(game => this.renderGame(game))}
                    </ul>
                    ${this.games.length ? "" : html`<p class="empty">${status === "ready" ? "No open games. Host one!" : "…"}</p>`}
                </section>

                <section class="host">
                    <h2>Host</h2>
                    <form @submit="${this.handleHost}">
                        <label>Name <input name="name" placeholder="${`${net.profile.name ?? "My"}'s game`}" maxlength="40" /></label>
                        <label>Max players <input name="max" type="number" min="2" max="64" value="${this.max}" /></label>
                        <label>Password <input name="password" type="password" placeholder="none" /></label>
                        <label class="check"><input name="public" type="checkbox" checked /> Listed in the lobby</label>
                        <pap-button type="submit" ${this.busy && "disabled"}>Host game</pap-button>
                    </form>
                </section>

                <section class="players">
                    <h2>Online <small>${others.length + 1}</small></h2>
                    <ul>
                        <li class="mine">${net.profile.name ?? "me"} (you)</li>
                        ${others.map(player => html`<li key="${player.id}">${player.profile.name ?? player.id}${player.game ? html` <small>hosting</small>` : ""}</li>`)}
                    </ul>
                </section>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-lobby": Lobby;
    }
}
