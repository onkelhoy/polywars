// system
import { CustomElement, html, property, query } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import { encodeQr } from "./qr";

const QUIET_ZONE = 4;
const SVG = "http://www.w3.org/2000/svg";

/**
 * A QR code of `value` as an SVG, with its quiet zone. Generated here, nothing leaves the browser.
 * Too much data for a QR code shows `too-long` instead.
 *
 * @element pw-qr-code
 *
 * @property {string} value the text to encode
 * @property {string} label what the code is, for screen readers
 * @property {string} too-long shown when `value` doesn't fit
 *
 * @csspart code the element holding the SVG
 * @csspart error the message shown when `value` doesn't fit
 */
export class QrCode extends CustomElement {
    static sheet = sheet;

    @property({ type: String, rerender: true }) value: string = "";
    @property({ type: String, rerender: true }) label: string = "QR code";
    @property({ type: String, rerender: true, attribute: "too-long" }) tooLong: string = "This is too long for a QR code";

    @query("[part='code']") private code?: HTMLElement;

    private drawn: string | null = null;
    private fits = true;

    update() {
        const matrix = this.value === this.drawn ? undefined : encodeQr(this.value);
        if (matrix !== undefined) this.fits = matrix !== null;
        super.update();

        // a value set before the first render finds no `code` yet, so it's looked up by hand
        const code = this.code ?? this.shadowRoot?.querySelector<HTMLElement>("[part='code']");
        if (matrix === undefined || !code) return undefined;
        this.drawn = this.value;
        code.replaceChildren(...(matrix && this.value ? [this.draw(matrix.size, matrix.modules)] : []));
        return undefined;
    }

    // one path, not a rect per module: a long link has thousands of them
    private draw(size: number, modules: boolean[]): SVGSVGElement {
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

    render() {
        return html`
            <div part="code" class="code" role="img" aria-label="${this.label}"></div>
            ${this.fits ? "" : html`<p part="error" class="error" role="alert">${this.tooLong}</p>`}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-qr-code": QrCode;
    }
}
