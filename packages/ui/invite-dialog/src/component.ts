// system
import { CustomElement, html, property, query } from "@papit/web-component";
import "@papit/dialog";
import "@polywar/qr-code";
import "@polywar/share-link";

// local
import sheet from "./style.css" with { type: "css" };

type Dialog = HTMLElement & { showModal(): void; close(): void; open?: boolean };

/**
 * Invite to a game: QR code, code to read out, link and share button. A modal by default (`open()`),
 * `inline` shows the same block in place (lobby side panel).
 *
 * @element pw-invite-dialog
 *
 * @property {string} link the invite link (QR + share). Empty shows `waiting`.
 * @property {string} code the game code, shown big
 * @property {boolean} inline no dialog, just the block (reflected)
 * @property {string} header dialog title
 * @property {string} text line above the link once there is one
 * @property {string} waiting line while there's no link yet
 *
 * @slot - extra content under the link
 */
export class InviteDialog extends CustomElement {
    static sheet = sheet;

    @property({ type: String, rerender: true }) link: string = "";
    @property({ type: String, rerender: true }) code: string = "";
    @property({ type: Boolean, reflect: true, rerender: true }) inline: boolean = false;
    @property({ type: String, rerender: true }) header: string = "Invite players";
    @property({ type: String, rerender: true }) text: string = "Scan the code or send the link.";
    @property({ type: String, rerender: true }) waiting: string = "Connecting…";

    @query("pap-dialog") private dialog?: Dialog;

    open() {
        this.dialog?.showModal();
    }

    close() {
        this.dialog?.close();
    }

    private block() {
        return html`
            <div class="invite" part="invite">
                <pw-qr-code part="qr" value="${this.link}" ?hidden="${!this.link}"></pw-qr-code>
                <div class="info">
                    ${this.code ? html`<p class="code" part="code">${this.code}</p>` : ""}
                    <p class="text">${this.link ? this.text : this.waiting}</p>
                    <pw-share-link link="${this.link}" ?hidden="${!this.link}"></pw-share-link>
                    <p class="link" part="link">${this.link}</p>
                    <slot></slot>
                </div>
            </div>
        `;
    }

    render() {
        if (this.inline) return this.block();
        return html`
            <pap-dialog header="${this.header}" close-outside-click>
                ${this.block()}
            </pap-dialog>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-invite-dialog": InviteDialog;
    }
}
