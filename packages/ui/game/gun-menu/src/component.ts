// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { GunMenuItem, PickEvent } from "./types";

const ORDER = ["rifle", "smg", "shotgun", "pistol"];

/**
 * A grid of guns grouped by `kind` (cards with thumbnail + name), a filter box on top.
 * `items` are the guns, `current` the held one. Click (or Enter on the first match) fires `pick` ({ index, item }).
 */
export class GunMenu extends CustomElement {
    static sheet = sheet;

    @property({ attribute: false, rerender: true }) items: GunMenuItem[] = [];
    @property({ type: Number, rerender: true }) current: number = -1;
    @property({ rerender: true }) filter: string = "";

    private pick(index: number) {
        this.dispatchEvent(new CustomEvent<PickEvent>("pick", { detail: { index, item: this.items[index] } }));
    }

    private shown() {
        const f = this.filter.trim().toLowerCase();
        return this.items.map((item, index) => ({ item, index })).filter(({ item }) => !f || item.name.toLowerCase().includes(f) || item.id.includes(f));
    }

    private handleInput = (e: Event) => { this.filter = (e.target as HTMLInputElement).value; };
    private handleKey = (e: KeyboardEvent) => {
        if (e.key !== "Enter") return;
        const first = this.shown()[0];
        if (first) this.pick(first.index);
    };

    /** focus the filter box (call when shown) */
    focusFilter() {
        (this.shadowRoot?.querySelector("input") as HTMLInputElement | null)?.focus();
    }

    render() {
        const list = this.shown();
        const kinds = [...new Set(list.map(l => l.item.kind ?? "other"))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
        return html`
            <input part="filter" placeholder="search" .value="${this.filter}" @input="${this.handleInput}" @keydown="${this.handleKey}" />
            ${kinds.map(kind => html`
                <section>
                    <h2>${kind}</h2>
                    <div class="grid">
                        ${list.filter(l => (l.item.kind ?? "other") === kind).map(({ item, index }) => html`
                            <button class="${index === this.current ? "card current" : "card"}" @click="${() => this.pick(index)}">
                                ${item.image ? html`<img src="${item.image}" alt="" />` : html`<span class="blank"></span>`}
                                <span class="name">${item.name}</span>
                            </button>
                        `)}
                    </div>
                </section>
            `)}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-gun-menu": GunMenu;
    }
}
