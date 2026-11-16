/**
 * Keyboard + mouse for a shooter: pointer lock on click, look deltas, held keys and buttons, wheel steps.
 * `consume()` hands out the look and wheel since the last call.
 */
export class Input {
    readonly keys = new Set<string>();
    /** held mouse buttons: 0 left, 2 right */
    readonly buttons = new Set<number>();
    /** keys pressed since the last `consume` (for one-shot actions: reload, switch) */
    readonly pressed = new Set<string>();
    onexit?: () => void;
    private dx = 0;
    private dy = 0;
    private wheel = 0;
    private cleanup: () => void;
    private had = false;

    constructor(readonly canvas: HTMLElement) {
        const root = () => canvas.getRootNode() as Document | ShadowRoot;
        const locked = () => root().pointerLockElement === canvas;
        const typing = () => {
            let a: Element | null = document.activeElement;
            while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
            return !!a && a.matches("input:not([type=range]):not([type=checkbox]), textarea, select");
        };
        const down = (e: KeyboardEvent) => {
            if (typing()) return;
            const k = e.key.toLowerCase();
            if (!this.keys.has(k)) this.pressed.add(k);
            this.keys.add(k);
            if (locked() && [" ", "tab"].includes(k)) e.preventDefault();
        };
        const up = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
        const press = (e: PointerEvent) => {
            if (!locked()) { if (e.button === 0) canvas.requestPointerLock()?.catch?.(() => { }); return; }
            this.buttons.add(e.button);
        };
        const release = (e: PointerEvent) => { this.buttons.delete(e.button); };
        const move = (e: MouseEvent) => { if (locked()) { this.dx += e.movementX; this.dy += e.movementY; } };
        const wheel = (e: WheelEvent) => { if (locked()) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } };
        const menu = (e: Event) => e.preventDefault();
        const change = () => {
            if (locked()) this.had = true;
            else if (this.had) { this.had = false; this.keys.clear(); this.buttons.clear(); this.onexit?.(); }
        };
        const blur = () => { this.keys.clear(); this.buttons.clear(); };
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        canvas.addEventListener("pointerdown", press);
        window.addEventListener("pointerup", release);
        document.addEventListener("mousemove", move);
        canvas.addEventListener("wheel", wheel, { passive: false });
        canvas.addEventListener("contextmenu", menu);
        document.addEventListener("pointerlockchange", change);
        window.addEventListener("blur", blur);
        this.cleanup = () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            canvas.removeEventListener("pointerdown", press);
            window.removeEventListener("pointerup", release);
            document.removeEventListener("mousemove", move);
            canvas.removeEventListener("wheel", wheel);
            canvas.removeEventListener("contextmenu", menu);
            document.removeEventListener("pointerlockchange", change);
            window.removeEventListener("blur", blur);
            if (locked()) document.exitPointerLock();
        };
    }

    get locked() { return (this.canvas.getRootNode() as Document).pointerLockElement === this.canvas; }

    key(...names: string[]) { return names.some(n => this.keys.has(n)); }

    lock() { this.canvas.requestPointerLock()?.catch?.(() => { }); }

    consume() {
        const out = { dx: this.dx, dy: this.dy, wheel: this.wheel, pressed: new Set(this.pressed) };
        this.dx = this.dy = this.wheel = 0;
        this.pressed.clear();
        return out;
    }

    destroy() { this.cleanup(); }
}
