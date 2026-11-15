import { aimOf, type Player } from "./player";
import type { AimTune } from "@polywar/armory";

type TunerOptions = {
    /** T only works while this is true (the view is playing) */
    active: () => boolean;
    /** localStorage key the tunes are kept under */
    store?: string;
    /** T key (default `t`) */
    key?: string;
};

const SLIDERS: [string, string, string, number][] = [["x", "left / right", "cm", 10], ["y", "down / up", "cm", 10], ["z", "nearer / further", "cm", 15],
    ["pitch", "pitch (up +)", "°", 15], ["yaw", "yaw (left +)", "°", 15], ["roll", "roll", "°", 20]];

const CSS = `
.pw-tuner { display: none; position: absolute; top: 8px; right: 8px; width: 330px; padding: 10px; background: #000c; color: #fff; border-radius: 6px; font: 13px system-ui, sans-serif; z-index: 10; }
.pw-tuner.open { display: block; }
.pw-tuner h2 { margin: 0 0 4px; font-size: 15px; }
.pw-tuner label { display: grid; grid-template-columns: 110px 1fr 56px; gap: 6px; align-items: center; margin: 3px 0; }
.pw-tuner output { text-align: right; }
.pw-tuner button { margin: 2px; }
.pw-tuner .info { display: block; text-align: left; opacity: .8; }
.pw-tuner code, .pw-tuner small { margin: 0 .3em; }`;

/**
 * The aim tuning panel (T while playing): sliders on the held gun's aimed pose and zero, kept in the browser per gun
 * (and scope), exported for `npm run aim` (writes weapon.json `aim` / `aim@<scope>`). Tunes kept in the browser win
 * over weapon.json until merged. Call `update()` every frame (follows gun switches).
 */
export class AimTuner {
    readonly element: HTMLElement;
    open = false;
    private shown = -1;
    private readonly store: string;
    private readonly key: string;

    constructor(readonly player: Player, host: HTMLElement, readonly options: TunerOptions) {
        this.store = options.store ?? "polywar.aim";
        this.key = options.key ?? "t";
        if (!document.getElementById("pw-tuner-style"))
        {
            const style = document.createElement("style");
            style.id = "pw-tuner-style";
            style.textContent = CSS;
            document.head.append(style);
        }
        const el = this.element = document.createElement("aside");
        el.className = "pw-tuner";
        el.innerHTML = `<h2>aim tuning <small>(T closes)</small></h2><p class="gun"></p><div class="sliders"></div>
            <label><span>zero (hits the sights at)</span><input name="zero" type="range" min="25" max="500" step="25" value="100" /><output name="zero-v"></output></label>
            <p>The sliders only move the gun's picture: aimed shots go where the drawn sights look. Zero: the range where the bullet meets the sights.</p>
            <p>Kept in this browser per gun (and scope). Export, then <code>npm run aim -- ~/Downloads/aim.json</code> writes them into each <code>weapon.json</code>.</p>
            <button name="reset" type="button">reset gun</button><button name="copy" type="button">copy snippet</button>
            <button name="export" type="button">export all</button><button name="forget" type="button">forget all</button>
            <button name="close" type="button">back (T)</button><output class="info"></output>`;
        for (const [id, name, , range] of SLIDERS)
        {
            const label = document.createElement("label");
            label.innerHTML = `<span>${name}</span><input name="${id}" type="range" min="${-range}" max="${range}" step=".1" value="0" /><output name="${id}-v"></output>`;
            el.querySelector(".sliders")!.append(label);
            this.input(id).oninput = () => this.apply(true);
        }
        this.input("zero").oninput = () => this.apply(true);
        this.button("close").onclick = () => this.toggle(false);
        this.button("reset").onclick = () => {
            for (const [id] of SLIDERS) this.input(id).value = "0";
            this.input("zero").value = String(this.player.held.gun.spec.zero);
            this.apply(true);
        };
        this.button("copy").onclick = async () => {
            const c = this.player.held;
            await navigator.clipboard.writeText(`"${c.tune.key}": ${JSON.stringify(this.tuneOf())}`);
            this.info("copied");
        };
        this.button("export").onclick = () => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(this.stored(), null, 4)], { type: "application/json" }));
            a.download = "aim.json";
            a.click();
            this.info("npm run aim -- ~/Downloads/aim.json");
        };
        this.button("forget").onclick = () => { if (confirm("forget every tune kept in this browser?")) { localStorage.removeItem(this.store); this.show(); } };
        host.append(el);

        for (const c of player.carried)
        {
            const t = this.stored()[c.tune.model]?.[c.tune.key];
            if (t) { c.hold.aim = aimOf(t); c.zero = t.zero; }
        }
        addEventListener("keydown", e => {
            if (e.key.toLowerCase() !== this.key || !this.options.active() || (e.target as HTMLElement)?.tagName === "INPUT") return;
            this.toggle(!this.open);
        });
        // a click on the view locks the mouse again: back to playing
        document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement && this.open) this.close(); });
    }

    toggle(on: boolean) {
        if (!on) { this.close(); this.player.input?.lock(); return; }
        this.open = true;
        this.element.classList.add("open");
        this.player.toggled = true;
        this.show();
        document.exitPointerLock();
    }

    /** every frame: the sliders follow the held gun */
    update() {
        if (this.open && this.shown !== this.player.current) this.show();
    }

    /** closes the panel (no mouse lock, unlike `toggle(false)`) */
    close() {
        this.open = false;
        this.element.classList.remove("open");
    }

    private input(name: string) { return this.element.querySelector<HTMLInputElement>(`input[name="${name}"]`)!; }
    private button(name: string) { return this.element.querySelector<HTMLButtonElement>(`button[name="${name}"]`)!; }
    private output(name: string) { return this.element.querySelector<HTMLOutputElement>(`output[name="${name}"]`)!; }
    private info(text: string) { this.element.querySelector<HTMLOutputElement>(".info")!.value = text; }
    private stored(): Record<string, Record<string, AimTune>> { return JSON.parse(localStorage.getItem(this.store) ?? "{}"); }

    /** the held gun's tune as weapon.json `aim` (metres, degrees) */
    private tuneOf(): AimTune {
        const v = SLIDERS.map(([id]) => +this.input(id).value), zero = +this.input("zero").value;
        const t: AimTune = { offset: [v[0] / 100, v[1] / 100, v[2] / 100].map(n => +n.toFixed(4)) as AimTune["offset"], angle: v.slice(3).map(n => +n.toFixed(2)) as AimTune["angle"] };
        if (zero !== this.player.held.gun.spec.zero) t.zero = zero;
        return t;
    }

    private apply(save: boolean) {
        const c = this.player.held, t = this.tuneOf();
        for (const [id, , unit] of SLIDERS) this.output(`${id}-v`).value = `${(+this.input(id).value).toFixed(1)} ${unit}`;
        c.hold.aim = aimOf(t);
        c.zero = t.zero;
        this.output("zero-v").value = `${this.input("zero").value} m`;
        if (!save) return;
        const all = this.stored();
        (all[c.tune.model] ??= {})[c.tune.key] = t;
        localStorage.setItem(this.store, JSON.stringify(all));
    }

    /** sliders from the held gun's tune (browser first, then weapon.json) */
    private show() {
        const c = this.player.held;
        this.shown = this.player.current;
        const t: AimTune = this.stored()[c.tune.model]?.[c.tune.key] ?? (c.weapon as Record<string, AimTune> | undefined)?.[c.tune.key] ?? { offset: [0, 0, 0], angle: [0, 0, 0] };
        const v = [...t.offset.map(n => n * 100), ...t.angle];
        SLIDERS.forEach(([id], i) => { this.input(id).value = String(v[i]); });
        this.input("zero").value = String(t.zero ?? c.gun.spec.zero);
        this.element.querySelector(".gun")!.textContent = `${c.gun.spec.name} · ${c.tune.model} "${c.tune.key}"`;
        this.apply(false);
    }
}
