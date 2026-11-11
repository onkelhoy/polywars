// Reads QR codes from a <video> fed by the camera. BarcodeDetector where the browser has one
// (Chrome, Android), the bundled jsQR elsewhere (Safari, Firefox). Frames stay in the browser.

const GAP_MS = 200;
// plenty for a code that fills part of the view, and much quicker to read
const MAX_SIDE = 640;

export type CameraError = "denied" | "missing" | "failed";

type Reader = (video: HTMLVideoElement) => Promise<string | null>;

declare const BarcodeDetector: {
    new(options: { formats: string[] }): { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
    getSupportedFormats?(): Promise<string[]>;
} | undefined;

/** True when the device says it has a camera (labels need permission, the kind doesn't). */
export async function hasCamera(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try
    {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === "videoinput");
    }
    catch { return false; }
}

export class Scanner {
    private stream: MediaStream | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private canvas: HTMLCanvasElement | null = null;
    // a stop while the camera is still starting
    private run = 0;

    constructor(private video: HTMLVideoElement, private onText: (text: string) => boolean, private onError: (reason: CameraError) => void) { }

    get active() {
        return !!this.stream;
    }

    async start() {
        const run = ++this.run;
        if (!navigator.mediaDevices?.getUserMedia) return this.onError("missing");
        try
        {
            // the camera first, on its own: whatever fails after this must be able to stop it
            const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
            if (run !== this.run)
            {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            this.stream = stream;
            const read = await this.reader();
            if (run !== this.run) return;

            // the attribute alone doesn't mute a video made from a template
            this.video.muted = true;
            this.video.srcObject = stream;
            await this.video.play();
            this.look(run, read);
        }
        catch (error)
        {
            if (run !== this.run) return;
            console.warn("[polywar] share: camera couldn't start", error);
            this.stop();
            const name = error instanceof DOMException ? error.name : "";
            this.onError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "missing" : "failed");
        }
    }

    stop() {
        this.run++;
        clearTimeout(this.timer);
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
        this.video.srcObject = null;
    }

    private async look(run: number, read: Reader) {
        if (run !== this.run) return;
        const text = await read(this.video).catch(() => null);
        if (run !== this.run) return;
        // the owner says whether it was the code it wanted, otherwise keep looking
        if (text && this.onText(text)) return;
        this.timer = setTimeout(() => this.look(run, read), GAP_MS);
    }

    private async reader(): Promise<Reader> {
        if (typeof BarcodeDetector !== "undefined")
        {
            const formats = await BarcodeDetector.getSupportedFormats?.().catch(() => []) ?? [];
            if (formats.includes("qr_code"))
            {
                const detector = new BarcodeDetector({ formats: ["qr_code"] });
                return async video => video.videoWidth ? (await detector.detect(video))[0]?.rawValue || null : null;
            }
        }
        const { default: decode } = await import("./vendor/jsqr");
        return async video => {
            if (!video.videoWidth) return null;
            const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
            const width = Math.round(video.videoWidth * scale);
            const height = Math.round(video.videoHeight * scale);
            this.canvas ??= document.createElement("canvas");
            this.canvas.width = width;
            this.canvas.height = height;
            const context = this.canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return null;
            context.drawImage(video, 0, 0, width, height);
            const { data } = context.getImageData(0, 0, width, height);
            return decode(data, width, height, { inversionAttempts: "dontInvert" })?.data || null;
        };
    }
}
