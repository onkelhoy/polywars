// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import "@papit/button";

// local
import sheet from "./style.css" with { type: "css" };

const COPIED_MS = 2_000;

/**
 * Button that hands over a link: the share sheet on phones, the clipboard elsewhere. It says "Copied"
 * itself (toasts sit behind modal dialogs). Without a clipboard (plain http on a phone) a prompt shows the link.
 *
 * @element pw-share-link
 *
 * @property {string} link the link to share
 * @property {boolean} compact short label on a clear button, for headers (reflected)
 * @property {string} text-copy / text-share / text-copied / text-compact labels
 *
 * @fires shared after the link was copied or shared
 */
export class ShareLink extends CustomElement {
    static sheet = sheet;

    @property({ type: String, rerender: true }) link: string = "";
    @property({ type: Boolean, reflect: true, rerender: true }) compact: boolean = false;
    @property({ type: String, rerender: true, attribute: "text-copy" }) textCopy: string = "Copy invite link";
    @property({ type: String, rerender: true, attribute: "text-share" }) textShare: string = "Share invite link";
    @property({ type: String, rerender: true, attribute: "text-copied" }) textCopied: string = "Copied";
    @property({ type: String, rerender: true, attribute: "text-compact" }) textCompact: string = "Invite";
    @property({ type: Boolean, attribute: false, rerender: true }) private copied: boolean = false;

    private timer: ReturnType<typeof setTimeout> | undefined;

    private get sheetted(): boolean {
        return typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
    }

    @bind
    private async handleClick() {
        if (!this.link) return;
        if (this.sheetted)
        {
            // closing the sheet rejects, and that's fine
            await navigator.share({ url: this.link }).then(() => this.shared(), () => undefined);
            return;
        }
        try
        {
            await navigator.clipboard.writeText(this.link);
        }
        catch
        {
            window.prompt(this.textCopy, this.link);
            return;
        }
        this.copied = true;
        this.shared();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.copied = false; }, COPIED_MS);
    }

    private shared() {
        this.dispatchEvent(new CustomEvent("shared", { detail: { link: this.link }, bubbles: true, composed: true }));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearTimeout(this.timer);
    }

    private get label(): string {
        if (this.copied) return this.textCopied;
        if (this.compact) return this.textCompact;
        return this.sheetted ? this.textShare : this.textCopy;
    }

    render() {
        return html`
            <pap-button size="small" variant="${this.compact ? "clear" : "outline"}" type="button" @click="${this.handleClick}">${this.label}</pap-button>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-share-link": ShareLink;
    }
}
