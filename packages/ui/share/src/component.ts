// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import "@papit/button";
import "@papit/dialog";

// local
import sheet from "./style.css" with { type: "css" };
import { encodeQr } from "./qr";
import { codeOf } from "./code";
import { hasCamera, Scanner, type CameraError } from "./scanner";

const QUIET_ZONE = 4;
const SVG = "http://www.w3.org/2000/svg";
const COPIED_MS = 2000;

export type ScanEvent = { text: string; code: string | null };

type Dialog = HTMLElement & { showModal(): void; close(): void };

/**
 * Everything for sharing a game in one place: the QR code of `link`, the code to read out, a share
 * (phone: share sheet) / copy button, and a scan button that opens the camera to read someone else's
 * code. Without `link` only the scan button shows (the lobby).
 *
 * @element pw-share
 *
 * @property {string} link what to share; the QR code says this
 * @property {string} code shown big, to read out
 * @property {boolean} dialog wrap it in a modal: `open()` / `close()` (reflected)
 * @property {string} header the dialog's title
 * @property {boolean} no-scan hide the scan button
 * @property {boolean} any-code `scan` fires for every code read, not only game codes
 * @property {string} param query parameter that carries the code in a link. Default `g`
 *
 * @fires scan `CustomEvent<ScanEvent>` a code was read: `{ text, code }`. The camera closes.
 * @fires shared `CustomEvent<{ link, via: "share" | "copy" }>`
 * @fires camera-error `CustomEvent<{ reason: "denied" | "missing" | "failed" }>`
 *
 * @slot - extra content under the buttons
 * @csspart qr / code / link / buttons / camera
 */
export class Share extends CustomElement {
    static sheet = sheet;

    @property({ type: String, rerender: true, after: function (this: Share) { this.drawQr(); } }) link: string = "";
    @property({ type: String, rerender: true }) code: string = "";
    @property({ type: Boolean, reflect: true, rerender: true }) dialog: boolean = false;
    @property({ type: String, rerender: true }) header: string = "Invite players";
    @property({ type: Boolean, attribute: "no-scan", rerender: true }) noScan: boolean = false;
    @property({ type: Boolean, attribute: "any-code" }) anyCode: boolean = false;
    @property({ type: String }) param: string = "g";

    @query("pap-dialog") private box?: Dialog;
    @query("dialog.camera") private camera?: HTMLDialogElement;
    @query("video") private video?: HTMLVideoElement;

    private canScan = false;
    private copied = false;
    private camMessage = "";
    private scanner: Scanner | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;

    connectedCallback() {
        super.connectedCallback?.();
        hasCamera().then(yes => {
            this.canScan = yes;
            this.requestUpdate();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        this.scanner?.stop();
        clearTimeout(this.timer);
    }

    firstRender() {
        super.firstRender();
        this.drawQr();
    }

    /** Opens the dialog (with `dialog`). */
    open() {
        this.box?.showModal();
    }

    close() {
        this.box?.close();
    }

    /** Opens the camera to read a code. */
    scan() {
        const camera = this.camera, video = this.video;
        if (!camera || !video) return;
        this.camMessage = "";
        this.requestUpdate();
        this.scanner ??= new Scanner(video, this.handleText, this.handleCameraError);
        camera.showModal();
        void this.scanner.start();
    }

    stopScan() {
        this.scanner?.stop();
        if (this.camera?.open) this.camera.close();
    }

    // ------------------------------------------------------------------ device

    /** A phone or tablet with a share sheet. */
    private get sheetted(): boolean {
        return typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
    }

    // ------------------------------------------------------------------ handlers

    @bind
    private async handleShare() {
        if (!this.link) return;
        if (this.sheetted)
        {
            // closing the sheet rejects, and that's fine
            await navigator.share({ url: this.link }).then(() => this.fire("shared", { link: this.link, via: "share" }), () => undefined);
            return;
        }
        try
        {
            await navigator.clipboard.writeText(this.link);
        }
        catch
        {
            window.prompt("Copy the link", this.link);
            return;
        }
        this.copied = true;
        this.fire("shared", { link: this.link, via: "copy" });
        this.requestUpdate();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.copied = false; this.requestUpdate(); }, COPIED_MS);
    }

    @bind
    private handleScan() {
        this.scan();
    }

    @bind
    private handleText(text: string): boolean {
        const code = codeOf(text, this.param);
        if (!code && !this.anyCode)
        {
            this.camMessage = "That's not a game code.";
            this.requestUpdate();
            return false;
        }
        this.stopScan();
        this.fire("scan", { text, code } satisfies ScanEvent);
        return true;
    }

    @bind
    private handleCameraError(reason: CameraError) {
        this.camMessage = reason === "denied" ? "Camera blocked. Allow it in the browser settings." : reason === "missing" ? "No camera found." : "The camera couldn't start.";
        this.fire("camera-error", { reason });
        this.requestUpdate();
    }

    @bind
    private handleCameraClose() {
        // Esc or the close button: the camera goes off with it
        this.scanner?.stop();
    }

    @bind
    private handleCancel() {
        this.stopScan();
    }

    private fire(type: string, detail: unknown) {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }

    // ------------------------------------------------------------------ qr

    private drawn: string | null = null;

    private drawQr() {
        const holder = this.shadowRoot?.querySelector<HTMLElement>("[part='qr']");
        if (!holder || this.drawn === this.link) return;
        this.drawn = this.link;
        const matrix = this.link ? encodeQr(this.link) : null;
        holder.replaceChildren(...(matrix ? [this.svg(matrix.size, matrix.modules)] : []));
    }

    // one path, not a rect per module: a long link has thousands of them
    private svg(size: number, modules: boolean[]): SVGSVGElement {
        const svg = document.createElementNS(SVG, "svg");
        svg.setAttribute("viewBox", `0 0 ${size + QUIET_ZONE * 2} ${size + QUIET_ZONE * 2}`);
        svg.setAttribute("shape-rendering", "crispEdges");
        let d = "";
        modules.forEach((dark, i) => {
            if (dark) d += `M${i % size + QUIET_ZONE} ${Math.floor(i / size) + QUIET_ZONE}h1v1h-1z`;
        });
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("d", d);
        svg.append(path);
        return svg;
    }

    // ------------------------------------------------------------------ render

    update() {
        super.update();
        this.drawQr();
        return undefined;
    }

    private block() {
        const sharing = !!this.link;
        const scanning = this.canScan && !this.noScan;
        return html`
            <div class="share ${sharing ? "" : "scan-only"}">
                <div part="qr" class="qr" role="img" aria-label="QR code of the invite link" ${!sharing && "hidden"}></div>
                <div class="info">
                    ${this.code ? html`<p part="code" class="code">${this.code}</p>` : ""}
                    <div part="buttons" class="buttons">
                        ${sharing ? html`<pap-button variant="outline" @click="${this.handleShare}">${this.copied ? "Copied ✓" : this.sheetted ? "Share" : "Copy link"}</pap-button>` : ""}
                        ${scanning ? html`<pap-button variant="${sharing ? "clear" : "outline"}" @click="${this.handleScan}">Scan code</pap-button>` : ""}
                    </div>
                    ${sharing ? html`<p part="link" class="link">${this.link}</p>` : ""}
                    <slot></slot>
                </div>
            </div>
            <dialog part="camera" class="camera" @close="${this.handleCameraClose}">
                <video playsinline muted aria-hidden="true"></video>
                <i class="frame" aria-hidden="true"></i>
                <p class="hint" role="status">${this.camMessage || "Point the camera at a game's QR code."}</p>
                <pap-button variant="outline" @click="${this.handleCancel}">Cancel</pap-button>
            </dialog>
        `;
    }

    render() {
        if (!this.dialog) return this.block();
        return html`<pap-dialog header="${this.header}" close-outside-click>${this.block()}</pap-dialog>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-share": Share;
    }
}
