import { invertRigid, mat4, point, type Vec3 } from "@polywar/viewmodel";
import type { AimTune } from "@polywar/armory";
import { aimOf, type Player } from "./player";
import { elbowOf } from "./arms";

/**
 * weapon.json `hands`: grip / fore in gun space, shoulders / elbows in camera space ([right, left]),
 * the hip pose (`hip` camera space, `hipAngle` radians) and the hands' own `turn` ([tilt, twist] degrees, [right, left]).
 */
export type HandsFile = { grip: Vec3; fore?: Vec3; shoulder: [Vec3, Vec3]; elbow: [Vec3, Vec3]; hip?: Vec3; hipAngle?: Vec3; turn?: [[number, number], [number, number]] };
/** per gun model: `aim`, `aim@<scope>`, `hands` (the shape of weapon.json) */
type Kept = Record<string, { hands?: HandsFile } & Record<string, AimTune | HandsFile | Vec3 | undefined>>;

type EditorOptions = {
    /** T only works while this is true (the view is playing) */
    active: () => boolean;
    /** localStorage key (default `polywar.weapon`) */
    store?: string;
    /** key (default `t`) */
    key?: string;
};

type View = "side" | "top" | "front";
const W = 320, H = 220, PAD = 16;
/** camera space -> the preview's [right, up] per view (orthographic) */
const AXES: Record<View, { h: [number, number]; v: [number, number] }> = {
    // [axis, sign]: side looks from the right (forward = right), top from above (forward = up), front from ahead
    side: { h: [2, -1], v: [1, 1] },
    top: { h: [0, 1], v: [2, -1] },
    front: { h: [0, 1], v: [1, 1] },
};
const POSE: [string, string, number, number][] = [["x", "right", 15, .1], ["y", "up", 15, .1], ["z", "back", 20, .1], ["pitch", "pitch", 30, .1], ["yaw", "yaw", 30, .1], ["roll", "roll", 40, .1]];
const SCOPE: [string, string][] = [["sx", "scope →"], ["sy", "scope ↑"], ["sz", "scope back"]];
const HANDS: [string, string][] = [["rt", "R tilt"], ["rw", "R twist"], ["lt", "L tilt"], ["lw", "L twist"]];

const CSS = `
.pw-wed { display: none; position: absolute; top: 8px; right: 8px; width: 340px; max-height: calc(100% - 16px); overflow: auto; padding: 8px; background: #000a; color: #fff; border-radius: 6px; font: 12px system-ui, sans-serif; z-index: 10; }
.pw-wed.open { display: block; }
.pw-wed h2 { margin: 0; font-size: 14px; display: flex; justify-content: space-between; }
.pw-wed p { margin: 4px 0; opacity: .85; }
.pw-wed canvas { display: block; background: #0004; border-radius: 4px; cursor: crosshair; touch-action: none; }
.pw-wed label { display: grid; grid-template-columns: 62px 1fr 48px; gap: 4px; align-items: center; margin: 1px 0; }
.pw-wed output { text-align: right; }
.pw-wed button { margin: 1px; font-size: 11px; }
.pw-wed button.on { background: #fd6; }
.pw-wed .info { display: block; text-align: left; }`;

type Handle = { kind: "hand" | "elbow" | "shoulder"; side: 0 | 1; get: () => Vec3; set: (p: Vec3) => void };

/**
 * The weapon editor (T while playing): the held gun's pose (hip or aimed, whichever you're in; Alt switches) and
 * hands. A small orthographic preview (side / top / front) to drag the gun, hands, elbows and shoulders; sliders for
 * the pose's offset and angles, the zero and the hands' tilt / twist. Live in the view, kept in the browser per gun,
 * exported for `npm run aim` (weapon.json `aim` / `aim@<scope>` / `hands`). Call `update()` every frame.
 */
export class WeaponEditor {
    readonly element: HTMLElement;
    open = false;
    private shown = -1;
    private aimed = false;
    private view: View = "side";
    private readonly store: string;
    private readonly key: string;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private dragging?: Handle | "gun";
    private last: [number, number] = [0, 0];
    private scale = 400;
    private origin: [number, number] = [0, 0];

    constructor(readonly player: Player, host: HTMLElement, readonly options: EditorOptions) {
        this.store = options.store ?? "polywar.weapon";
        this.key = options.key ?? "t";
        if (!document.getElementById("pw-wed-style"))
        {
            const style = document.createElement("style");
            style.id = "pw-wed-style";
            style.textContent = CSS;
            document.head.append(style);
        }
        const el = this.element = document.createElement("aside");
        el.className = "pw-wed";
        el.innerHTML = `<h2><span>weapon <small class="pose"></small></span><small>T closes · Alt hip / aim</small></h2><p class="gun"></p>
            <div><button name="side" type="button">side</button><button name="top" type="button">top</button><button name="front" type="button">front</button></div>
            <canvas width="${W}" height="${H}"></canvas>
            <p>Drag the gun, <b style="color:#f66">R</b> / <b style="color:#6af">L</b> hands, elbows (small), shoulders (square).</p>
            <div class="pose-sliders"></div>
            <label class="zero"><span>zero</span><input name="zero" type="range" min="25" max="500" step="25" value="100" /><output name="zero-v"></output></label>
            <div class="hand-sliders"></div>
            <label class="scope-pick"><span>scope</span><select name="scope"></select><output></output></label>
            <div class="scope-sliders"></div>
            <p>Kept in this browser per gun. Export, then <code>npm run aim -- ~/Downloads/weapon.json</code>.</p>
            <button name="reset" type="button">reset pose</button><button name="reset-hands" type="button">reset hands</button>
            <button name="export" type="button">export all</button><button name="forget" type="button">forget all</button><output class="info"></output>`;
        const slider = (host: string, id: string, name: string, range: number, step: number) => {
            const label = document.createElement("label");
            label.innerHTML = `<span>${name}</span><input name="${id}" type="range" min="${-range}" max="${range}" step="${step}" value="0" /><output name="${id}-v"></output>`;
            el.querySelector(host)!.append(label);
        };
        for (const [id, name, range, step] of POSE) slider(".pose-sliders", id, name, range, step);
        for (const [id, name] of HANDS) slider(".hand-sliders", id, name, 90, 1);
        // the scope on the gun (O cycles too) and its place on the mount, mm
        for (const [id, name] of SCOPE) slider(".scope-sliders", id, name, 60, .5);
        const pick = el.querySelector<HTMLSelectElement>('select[name="scope"]')!;
        pick.innerHTML = `<option value="">none</option>` + player.scopeIds.map(id => `<option>${id}</option>`).join("");
        pick.onchange = async () => { await this.player.setScope(this.player.current, pick.value || undefined, this.keptMount(pick.value)); this.show(); };
        for (const [id] of SCOPE) this.input(id).oninput = () => this.fromScopeSliders();
        for (const [id] of POSE) this.input(id).oninput = () => this.fromPoseSliders();
        this.input("zero").oninput = () => this.fromPoseSliders();
        for (const [id] of HANDS) this.input(id).oninput = () => this.fromHandSliders();
        this.canvas = el.querySelector("canvas")!;
        this.ctx = this.canvas.getContext("2d")!;
        for (const v of ["side", "top", "front"] as View[]) this.button(v).onclick = () => { this.view = v; this.fit(); };
        this.button("reset").onclick = () => {
            const c = this.player.held;
            if (this.aimed) { c.hold.aim = undefined; c.zero = undefined; this.keep(c.tune.key, undefined); }
            else { const h = this.player.handsOf(this.player.current); h.hip = [...c.base]; h.hipAngle = [0, 0, 0]; this.player.setHands(this.player.current, h); this.saveHands(); }
            this.show();
        };
        this.button("reset-hands").onclick = () => {
            this.player.resetHands(this.player.current);
            this.keep("hands", undefined);
            this.show();
        };
        this.button("export").onclick = () => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(this.stored(), null, 4)], { type: "application/json" }));
            a.download = "weapon.json";
            a.click();
            this.info("npm run aim -- ~/Downloads/weapon.json");
        };
        this.button("forget").onclick = () => { if (confirm("forget every weapon tune kept in this browser?")) { localStorage.removeItem(this.store); this.info("forgotten (reload to see weapon.json again)"); } };
        this.canvas.onpointerdown = e => {
            const [mx, my] = [e.offsetX, e.offsetY];
            this.dragging = this.handles().reverse().find(h => { const [x, y] = this.toScreen(h.get()); return Math.hypot(x - mx, y - my) < 9; }) ?? "gun";
            this.last = [mx, my];
            this.canvas.setPointerCapture(e.pointerId);
        };
        this.canvas.onpointermove = e => {
            const h = this.dragging;
            if (!h) return;
            if (h === "gun")
            {
                const d = this.delta(e.offsetX - this.last[0], e.offsetY - this.last[1]);
                this.last = [e.offsetX, e.offsetY];
                this.moveGun(d);
            }
            else { h.set(this.fromScreen(e.offsetX, e.offsetY, h.get())); this.saveHands(); }
        };
        this.canvas.onpointerup = () => { this.dragging = undefined; };
        host.append(el);

        // kept tunes (old `polywar.aim` tunes too) win over weapon.json until merged
        const old: Record<string, Record<string, AimTune>> = JSON.parse(localStorage.getItem("polywar.aim") ?? "{}");
        player.carried.forEach((c, i) => {
            const kept = this.stored()[c.tune.model], t = (kept?.[c.tune.key] ?? old[c.tune.model]?.[c.tune.key]) as AimTune | undefined;
            if (t) { c.hold.aim = aimOf(t); c.zero = t.zero; }
            if (kept?.hands) player.setHands(i, kept.hands);
            const mount = c.sid ? kept?.[`mount@${c.sid}`] as Vec3 | undefined : undefined;
            if (mount) void player.setScope(i, c.sid, mount);
        });
        addEventListener("keydown", e => {
            if (e.key.toLowerCase() !== this.key || !this.options.active() || (e.target as HTMLElement)?.tagName === "INPUT") return;
            this.toggle(!this.open);
        });
        document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement && this.open) this.close(); });
    }

    toggle(on: boolean) {
        if (!on) { this.close(); this.player.input?.lock(); return; }
        this.open = true;
        this.element.classList.add("open");
        this.show();
        document.exitPointerLock();
    }

    /** every frame: follows gun switches and hip / aim, redraws the preview */
    update() {
        if (!this.open) return;
        const aimed = this.player.toggled || (this.player.gun?.aimed ?? 0) > .5;
        if (this.shown !== this.player.current || aimed !== this.aimed) this.show();
        this.draw();
    }

    close() {
        this.open = false;
        this.element.classList.remove("open");
    }

    private input(name: string) { return this.element.querySelector<HTMLInputElement>(`input[name="${name}"]`)!; }
    private button(name: string) { return this.element.querySelector<HTMLButtonElement>(`button[name="${name}"]`)!; }
    private output(name: string) { return this.element.querySelector<HTMLOutputElement>(`output[name="${name}"]`)!; }
    private info(text: string) { this.element.querySelector<HTMLOutputElement>(".info")!.value = text; }
    private stored(): Kept { return JSON.parse(localStorage.getItem(this.store) ?? "{}"); }
    private keep(key: string, value: AimTune | HandsFile | Vec3 | undefined) {
        const all = this.stored(), model = this.player.held.tune.model, entry = all[model] ??= {};
        if (value) entry[key] = value; else delete entry[key];
        localStorage.setItem(this.store, JSON.stringify(all));
    }
    private keptMount(sid: string) { return sid ? this.stored()[this.player.held.tune.model]?.[`mount@${sid}`] as Vec3 | undefined : undefined; }

    /** the scope sliders (mm) -> the mount nudge, kept as `mount@<scope>` */
    private async fromScopeSliders() {
        const c = this.player.held;
        if (!c.sid) return;
        const m = SCOPE.map(([id]) => +(+this.input(id).value / 1000).toFixed(4)) as Vec3;
        this.keep(`mount@${c.sid}`, m.every(v => v === 0) ? undefined : m);
        await this.player.setScope(this.player.current, c.sid, m);
        this.showValues();
    }

    private saveHands() { this.keep("hands", this.player.handsOf(this.player.current)); }

    // ---- the pose ----

    /** the pose being edited as [x, y, z (cm), pitch, yaw, roll (deg)] */
    private poseValues(): number[] {
        const c = this.player.held, d = 180 / Math.PI;
        if (this.aimed)
        {
            const a = c.hold.aim ?? { offset: [0, 0, 0], angle: [0, 0, 0] };
            return [...a.offset.map(v => v * 100), ...a.angle.map(v => v * d)];
        }
        const h = c.hold.hip, b = c.base, an = c.hold.hipAngle ?? [0, 0, 0];
        return [(h[0] - b[0]) * 100, (h[1] - b[1]) * 100, (h[2] - b[2]) * 100, ...an.map(v => v * d)];
    }

    private setPose(v: number[]) {
        const c = this.player.held, r = Math.PI / 180;
        if (this.aimed)
        {
            const t: AimTune = { offset: v.slice(0, 3).map(n => +(n / 100).toFixed(4)) as Vec3, angle: v.slice(3).map(n => +n.toFixed(2)) as Vec3 };
            const zero = +this.input("zero").value;
            if (zero !== c.gun.spec.zero) t.zero = zero;
            c.hold.aim = aimOf(t); c.zero = t.zero;
            this.keep(c.tune.key, t);
        }
        else
        {
            const b = c.base, h = this.player.handsOf(this.player.current);
            h.hip = [b[0] + v[0] / 100, b[1] + v[1] / 100, b[2] + v[2] / 100].map(n => +n.toFixed(4)) as Vec3;
            h.hipAngle = v.slice(3).map(n => +(n * r).toFixed(4)) as Vec3;
            this.player.setHands(this.player.current, h);
            this.saveHands();
        }
        this.showValues();
    }

    private fromPoseSliders() { this.setPose(POSE.map(([id]) => +this.input(id).value)); }

    private moveGun(d: Vec3) {
        const v = this.poseValues();
        v[0] += d[0] * 100; v[1] += d[1] * 100; v[2] += d[2] * 100;
        this.setPose(v);
        POSE.forEach(([id], i) => { this.input(id).value = String(v[i]); });
    }

    private fromHandSliders() {
        const h = this.player.handsOf(this.player.current), v = HANDS.map(([id]) => +this.input(id).value);
        h.turn = [[v[0], v[1]], [v[2], v[3]]];
        this.player.setHands(this.player.current, h);
        this.saveHands();
        this.showValues();
    }

    private showValues() {
        for (const [id, , , ] of POSE) this.output(`${id}-v`).value = `${(+this.input(id).value).toFixed(1)} ${"xyz".includes(id) ? "cm" : "°"}`;
        for (const [id] of HANDS) this.output(`${id}-v`).value = `${this.input(id).value}°`;
        this.output("zero-v").value = `${this.input("zero").value} m`;
        for (const [id] of SCOPE) this.output(`${id}-v`).value = `${this.input(id).value} mm`;
    }

    private show() {
        const c = this.player.held;
        this.shown = this.player.current;
        this.aimed = this.player.toggled || (this.player.gun?.aimed ?? 0) > .5;
        this.element.querySelector(".gun")!.textContent = `${c.gun.spec.name} · ${c.tune.model}${this.aimed ? ` "${c.tune.key}"` : ""}`;
        this.element.querySelector(".pose")!.textContent = this.aimed ? "aimed" : "hip";
        (this.element.querySelector(".zero") as HTMLElement).style.display = this.aimed ? "" : "none";
        this.poseValues().forEach((v, i) => { this.input(POSE[i][0]).value = String(v); });
        this.input("zero").value = String(c.zero ?? c.gun.spec.zero);
        const turn = this.player.handsOf(this.player.current).turn ?? [[0, 0], [0, 0]];
        [turn[0][0], turn[0][1], turn[1][0], turn[1][1]].forEach((v, i) => { this.input(HANDS[i][0]).value = String(v); });
        this.element.querySelector<HTMLSelectElement>('select[name="scope"]')!.value = c.sid ?? "";
        (this.element.querySelector(".scope-sliders") as HTMLElement).style.display = c.sid ? "" : "none";
        SCOPE.forEach(([id], i) => { this.input(id).value = String((c.mount?.[i] ?? 0) * 1000); });
        this.showValues();
        this.fit();
    }

    // ---- the preview ----

    private hv(p: Vec3): [number, number] { const a = AXES[this.view]; return [p[a.h[0]] * a.h[1], p[a.v[0]] * a.v[1]]; }
    private toScreen(p: Vec3): [number, number] { const [h, v] = this.hv(p); return [this.origin[0] + h * this.scale, this.origin[1] - v * this.scale]; }
    /** screen back to camera space, the hidden axis from `keep` */
    private fromScreen(x: number, y: number, keep: Vec3): Vec3 {
        const a = AXES[this.view], p: Vec3 = [...keep];
        p[a.h[0]] = (x - this.origin[0]) / this.scale * a.h[1];
        p[a.v[0]] = (this.origin[1] - y) / this.scale * a.v[1];
        return p;
    }
    private delta(dx: number, dy: number): Vec3 {
        const a = AXES[this.view], d: Vec3 = [0, 0, 0];
        d[a.h[0]] = dx / this.scale * a.h[1];
        d[a.v[0]] = -dy / this.scale * a.v[1];
        return d;
    }

    /** scale and origin round the gun, the shoulders and the eye */
    private fit() {
        const m = this.player.vm.matrix, t = this.player.held.model.restTriangles(), h = this.player.handsOf(this.player.current);
        let h0 = 0, h1 = 0, v0 = 0, v1 = 0;
        const add = (p: Vec3) => { const [a, b] = this.hv(p); h0 = Math.min(h0, a); h1 = Math.max(h1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); };
        for (let i = 0; i < t.length; i += 27) add(point(m, [t[i], t[i + 1], t[i + 2]]));
        if (!this.player.bodyHolds) for (const p of h.shoulder) add(p);
        for (const p of h.elbow) add(p);
        // a little room round it to drag in
        const mh = (h1 - h0) * .15 + .03, mv = (v1 - v0) * .15 + .03;
        h0 -= mh; h1 += mh; v0 -= mv; v1 += mv;
        this.scale = Math.min((W - 2 * PAD) / (h1 - h0), (H - 2 * PAD) / (v1 - v0));
        this.origin = [W / 2 - (h0 + h1) / 2 * this.scale, H / 2 + (v0 + v1) / 2 * this.scale];
        for (const v of ["side", "top", "front"]) this.button(v).classList.toggle("on", v === this.view);
        this.tris = this.player.held.model.restTriangles();
    }
    private tris: Float32Array<ArrayBufferLike> = new Float32Array(0);

    /** the draggable points, all read / written in camera space (hands live on the gun: written back in gun space) */
    private handles(): Handle[] {
        const pl = this.player, i = pl.current, h = () => pl.handsOf(i), m = pl.vm.matrix;
        const hand = (side: 0 | 1): Handle => {
            const name = side ? "fore" : "grip";
            return {
                kind: "hand", side,
                get: () => point(m, h()[name]!),
                set: p => { const inv = invertRigid(mat4(), m); pl.setHands(i, { ...h(), [name]: point(inv, p) }); },
            };
        };
        const cam = (kind: "shoulder" | "elbow", side: 0 | 1): Handle => ({
            kind, side,
            get: () => h()[kind][side],
            set: p => { const v = h(); v[kind][side] = p; pl.setHands(i, v); },
        });
        const list: Handle[] = [];
        for (const side of (h().fore ? [0, 1] : [0]) as (0 | 1)[])
        {
            if (!pl.bodyHolds) list.push(cam("shoulder", side));
            list.push(cam("elbow", side), hand(side));
        }
        return list;
    }

    private draw() {
        const g = this.ctx, m = this.player.vm.matrix, k = this.scale, [ox, oy] = this.origin, a = AXES[this.view];
        g.clearRect(0, 0, W, H);
        // the gun (live: sway and all)
        g.fillStyle = "#c8c8d0aa"; g.beginPath();
        const t = this.tris;
        const sx = [0, 0, 0], sy = [0, 0, 0];
        for (let i = 0; i < t.length; i += 9)
        {
            for (let c = 0; c < 3; c++)
            {
                const x = t[i + c * 3], y = t[i + c * 3 + 1], z = t[i + c * 3 + 2];
                const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
                sx[c] = ox + p[a.h[0]] * a.h[1] * k; sy[c] = oy - p[a.v[0]] * a.v[1] * k;
            }
            // one winding for all (front and back faces would cancel out in the fill)
            const flip = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sy[1] - sy[0]) * (sx[2] - sx[0]) < 0;
            g.moveTo(sx[0], sy[0]);
            if (flip) { g.lineTo(sx[2], sy[2]); g.lineTo(sx[1], sy[1]); }
            else { g.lineTo(sx[1], sy[1]); g.lineTo(sx[2], sy[2]); }
            g.closePath();
        }
        g.fill();
        // the eye
        g.fillStyle = "#fff"; g.beginPath(); g.arc(ox, oy, 3, 0, Math.PI * 2); g.fill();
        g.font = "10px system-ui"; g.fillText("eye", ox + 5, oy - 5);
        const h = this.player.handsOf(this.player.current), colors = ["#f66", "#6af"];
        const turn = h.turn ?? [[0, 0], [0, 0]];
        for (const side of (h.fore ? [0, 1] : [0]) as (0 | 1)[])
        {
            const s = this.player.shoulderOf(side) ?? h.shoulder[side], e = h.elbow[side], hp = point(m, side ? h.fore! : h.grip);
            const elbow = elbowOf(this.player.armsLook, s, hp, [e[0] - s[0], e[1] - s[1], e[2] - s[2]]);
            const pts = [s, elbow, hp].map(p => this.toScreen(p));
            g.strokeStyle = colors[side]; g.lineWidth = 3; g.globalAlpha = .8; g.beginPath();
            pts.forEach(([x, y], n) => n ? g.lineTo(x, y) : g.moveTo(x, y));
            g.stroke();
            const [ex, ey] = this.toScreen(e);
            g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(pts[1][0], pts[1][1]); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
            g.globalAlpha = 1;
            // the hand: palm, fingers curled round the grip, thumb; along the forearm, turned by tilt
            const [fx, fy] = pts[1], [hx, hy] = pts[2];
            const ang = Math.atan2(hy - fy, hx - fx) + (this.view === "side" ? -turn[side][0] * Math.PI / 180 : 0);
            this.hand(g, hx, hy, ang, Math.max(8, .09 * k), colors[side], side === 1);
        }
        for (const handle of this.handles())
        {
            if (handle.kind === "hand") continue;
            const [x, y] = this.toScreen(handle.get());
            g.fillStyle = colors[handle.side]; g.strokeStyle = "#000"; g.lineWidth = 1; g.beginPath();
            if (handle.kind === "shoulder") g.rect(x - 5, y - 5, 10, 10); else g.arc(x, y, 4, 0, Math.PI * 2);
            g.fill(); g.stroke();
        }
    }

    /** a little hand at (x, y) pointing `angle`, `size` px long */
    private hand(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string, mirror: boolean) {
        g.save();
        g.translate(x, y); g.rotate(angle); if (mirror) g.scale(1, -1);
        const s = size;
        g.fillStyle = color; g.strokeStyle = "#000c"; g.lineWidth = 1;
        g.beginPath(); g.roundRect(-s * .45, -s * .28, s * .6, s * .56, s * .12); g.fill(); g.stroke();
        // curled fingers
        for (let f = 0; f < 4; f++) { g.beginPath(); g.roundRect(s * .12, -s * .26 + f * s * .14, s * .32, s * .12, s * .06); g.fill(); g.stroke(); }
        // thumb
        g.beginPath(); g.roundRect(-s * .1, -s * .48, s * .38, s * .14, s * .07); g.fill(); g.stroke();
        g.restore();
    }
}
