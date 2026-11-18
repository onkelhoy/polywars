import type { Camera, CameraController, Layer3D } from "@papit/game-engine";
import { upload, type GPUMesh } from "@papit/game-mesh";
import { Matrix4 } from "@papit/matrix";
import { Vector3 } from "@papit/vector";
import { Bullets, zeroAngle } from "@polywar/ballistics";
import { Attachments, Character, type Move } from "@polywar/characters";
import { Impacts } from "@polywar/impacts";
import { Mover } from "@polywar/mover";
import { Model, type Renderer } from "@polywar/renderer";
import { Brace, Optic, direction, invertRigid, mat4, Obstruction, perspective, point, Scope, ViewModel, type Hold, type Vec3 } from "@polywar/viewmodel";
import { Gun, GUNS, cycleCues, type Action, type Cue } from "@polywar/weapons";
import { Armory, type AimTune, type ClipStep, type GunAnimation, type WeaponFile } from "@polywar/armory";
import { ARMS, armsPoseOf, type ArmsPose } from "./arms";
import { bend, bodyArm, flat, FORE_HAND, grip, handRotation, holdRotation, PISTOL_GRIP, reach, release, turnFrame, WRIST_GRIP, type BodyArm, type HandFrame, type SkinLike } from "./body-arms";
import type { HandsFile } from "./weapon-editor";
import { Feel } from "./feel";
import { bonePoint, holdOf, scopeMountFor, scopeMountOf } from "./holds";
import { Input } from "./input";
import type { PlayerEvents, PlayerSetting } from "./types";

/** `scopeModel` (a scope from the armory) is drawn `scopeAt` off the gun; `scopeMesh` is the stand-in without one */
type Carried = { gun: Gun; model: Model; hold: Hold; weapon?: WeaponFile; tune: { model: string; key: string }; zero?: number; scope?: Scope; zoom?: [number, number]; scopeModel?: Model; scopeAt?: Matrix4; scopeMesh?: GPUMesh; arms?: ArmsPose; turn?: [[number, number], [number, number]]; hands?: { grip: Vec3; fore?: Vec3 }; base: Vec3 };

const LIMIT = Math.PI / 2 - .02;
/** lean: metres the eye goes out, radians the view rolls */
const LEAN = .32, LEAN_ROLL = .2;

/** most the body backs off a wall while aiming, m */
const BACK_OFF = .4;

/**
 * A playable character in first person: walks on the host's ground (`@polywar/mover`), looks with the mouse,
 * carries guns (`@polywar/weapons`) held by a `ViewModel` with arms, fires real bullets (`@polywar/ballistics`)
 * that leave tracers, bits and marks (`@polywar/impacts`), a scope with its own picture for scoped guns.
 * Its body (a `character.json`) is drawn under the view, head and arms left out.
 *
 * Keys: WASD walk, shift run, space jump, left mouse fire, right mouse aim (held) or Option / Alt (toggle),
 * Q / E lean, R reload, 1..9 / [ ] switch guns, wheel zooms a scope while aimed, Esc lets go of the mouse.
 * Guns are `GUNS` ids, `<id>@<scope>` puts a scope from `assets/models/weapons/attachments/` on (e.g. `kar98k@scope-2`).
 */
export class Player {
    private obstruction: Obstruction;
    /** looking through binoculars / a spotting scope: the gun goes away, the view zooms and shakes */
    private optic?: Optic;
    /** a fixed optic's eye (world): the camera stays there, no walking */
    private opticEye?: Vec3;
    /** look through `optic` (binoculars: handheld; a spotting scope: with its `eye`), `undefined` to stop */
    lookThrough(optic?: Optic, eye?: Vec3) { this.optic = optic; this.opticEye = optic && eye; }
    get looking() { return !!this.optic; }

    /** aiming into a wall: m backed off so far, and room behind to back off (this frame) */
    private backed = 0;
    private room = false;
    /** the free (support) hand on a wall / rail */
    private brace: Brace;
    readonly mover: Mover;
    readonly bullets: Bullets;
    readonly impacts: Impacts;
    readonly vm: ViewModel;
    readonly carried: Carried[] = [];
    readonly ready: Promise<void>;
    current = 0;
    yaw = 0;
    pitch = 0;
    input?: Input;
    character?: Character;
    attachments?: Attachments;
    body?: Model;
    /** shots fired, hits, for the HUD */
    shots = 0;
    hits = 0;
    /** last frame's spread cone (radians), for a crosshair */
    spread = 0;
    /** draw the body under the view */
    showBody = true;
    private gl: WebGL2RenderingContext;
    private eye: number;
    private bodyTime = 0;
    private move: Move = "idle";
    /** the body's clip per move (character.json `clips`, else the first name the glb has) */
    private clips: Partial<Record<Move, string>> = {};
    private climb = 0;
    private near = mat4();
    private hidden: number[] = [];
    private tracerCount = 0;
    /** aim toggled on (Option / Alt; the range's tuning panel holds it) */
    toggled = false;
    /** per gun model: iron sight flipped up and seconds since the flip (V) */
    private toggles = new Map<string, { on: boolean; t: number }>();
    /** -1 left .. 1 right, eased */
    lean = 0;
    readonly armory: Armory;
    /** sounds and thrown cases (`@polywar/weapon-audio`, `@polywar/debris` in a `@papit/rigidbody` world) */
    readonly feel: Feel;
    private cam = mat4();

    constructor(readonly layer: Layer3D, readonly renderer: Renderer, readonly setting: PlayerSetting, readonly events: PlayerEvents = {}, at: Vec3 = [0, 0, 0]) {
        this.gl = layer.gl;
        this.eye = setting.eye ?? 1.65;
        this.mover = new Mover({ ground: setting.ground, colliders: setting.colliders, slope: setting.slope ?? 40 }, at);
        this.impacts = new Impacts(layer);
        this.bullets = new Bullets(setting.cast);
        this.bullets.onhit = (b, hit) => {
            this.impacts.hit(hit.point, hit.normal, hit.surface, b.direction);
            if (hit.target !== undefined) this.hits++;
            this.events.hit?.(b, hit);
        };
        this.vm = new ViewModel({ grip: [0, 0, 0], muzzle: [0, 0, -1], sight: [0, 0, 0], hip: [.15, -.2, -.3], eye: .2 });
        this.obstruction = new Obstruction({ cast: setting.cast });
        this.brace = new Brace({ cast: setting.cast });
        this.armory = new Armory(setting.assets ?? "/assets");
        this.feel = new Feel({ world: setting.world, mixer: setting.mixer, ground: setting.ground, cast: setting.cast, surface: setting.surface, assets: setting.assets ?? "/assets" });
        this.ready = this.load();
    }

    private async load() {
        const url = this.setting.gunsUrl ?? this.armory.guns;
        const ids = this.setting.guns ?? Object.keys(GUNS);
        const loaded = await Promise.all(ids.map(async entry => {
            const [id, scopeId] = entry.split("@"), spec = GUNS[id];
            const weapon = await this.armory.weapon(spec.model).catch(() => undefined);
            if (weapon?.sounds) spec.sounds = weapon.sounds;
            // a scoped spec without a named scope takes the first that fits
            const sid = scopeId ?? (spec.scope ? weapon?.scopes[0] : undefined);
            const scope = sid ? await this.armory.scope(sid).catch(() => undefined) : undefined;
            const [model, scopeModel] = await Promise.all([Model.load(this.gl, `${url}${spec.model}/model.glb`), scope ? Model.load(this.gl, scope.url + scope.model) : undefined]);
            // the case flies at weapon.json `animation.shoot.eject` (a frame of `shoot`, which plays over the shot's span)
            const ej = weapon?.animation?.shoot?.eject, shoot = model.animation(weapon?.animation?.shoot?.clip ?? "shoot");
            if (ej !== undefined && shoot && shoot.duration > 0 && ["semi", "auto", "pistol"].includes(weapon!.action))
            {
                const span = Math.min(shoot.duration, Math.max(.08, spec.interval * .85));
                const at = ej / (weapon!.animation!.fps ?? 24) / shoot.duration * span / spec.interval;
                spec.cues = { ...spec.cues, cycle: [...(spec.cues?.cycle ?? []).filter(c => c[1] !== "eject"), [at, "eject"]] };
            }
            // bolt / lever / pump: the case flies at `animation.cycle.eject` (a frame of `cycle`, played over the last 80% of the interval)
            const cyc = weapon?.animation?.cycle as { clip?: string; eject?: number } | undefined, cej = cyc?.eject, cycle = model.animation(cyc?.clip ?? "cycle");
            if (cej !== undefined && cycle && cycle.duration > 0 && !["semi", "auto", "pistol"].includes(weapon!.action))
            {
                const at = .2 + .8 * Math.min(1, cej / (weapon!.animation!.fps ?? 24) / cycle.duration);
                spec.cues = { ...spec.cues, cycle: [...(spec.cues?.cycle ?? cycleCues(spec, weapon!.action as Action)).filter(c => c[1] !== "eject"), [at, "eject"]] };
            }
            // the reload's sounds from weapon.json `animation.reload` / `reloadEmpty` cues
            const anim = weapon?.animation;
            if (anim?.reload) spec.cues = { ...spec.cues, reload: stepCues(model, anim.reload, anim.fps ?? 24) };
            if (anim?.reloadEmpty) spec.cues = { ...spec.cues, reloadEmpty: stepCues(model, anim.reloadEmpty, anim.fps ?? 24) };
            return { id, weapon, scope, model, scopeModel, sid };
        }));
        for (const { id, weapon, scope: data, model, scopeModel, sid } of loaded)
        {
            const gun = new Gun(id, Infinity, weapon?.action);
            gun.oncue = (cue, g) => this.cue(cue, g);
            void this.feel.caseOf(this.gl, gun.caliber.model);
            let hold = holdOf(model, gun.spec, weapon), scope: Scope | undefined, scopeMesh: GPUMesh | undefined, scopeAt: Matrix4 | undefined;
            let zoom: [number, number] | undefined;
            if (weapon && data)
            {
                const mount = scopeMountFor(weapon, data);
                scope = new Scope(this.layer, mount);
                zoom = data.zoom;
                scopeAt = Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...mount.offset, 1]);
            }
            else if (gun.spec.scope)
            {
                scope = new Scope(this.layer, scopeMountOf(model));
                zoom = [gun.spec.scope.min, gun.spec.scope.max];
                scopeMesh = upload(this.gl, scope.mesh());
            }
            if (scope && zoom)
            {
                scope.zoom = Math.sqrt(zoom[0] * zoom[1]);
                hold = scope.hold(hold, Math.PI / 3);
            }
            const tune = { model: gun.spec.model, key: sid ? `aim@${sid}` : "aim" } as const;
            const saved = weapon?.[tune.key as "aim"];
            if (saved) hold.aim = aimOf(saved);
            this.carried.push({ gun, model, hold, weapon, tune, zero: saved?.zero, scope, zoom, scopeModel, scopeAt, scopeMesh, base: [...hold.hip] as Vec3 });
            const hands = (weapon as { hands?: HandsFile } | undefined)?.hands;
            if (hands) this.setHands(this.carried.length - 1, hands);
        }
        this.select(0);
        if (this.setting.character) await this.setCharacter(this.setting.character);
    }

    /**
     * Swaps the body (a `character.json` url). Bodies with `arm.L` / `arm.R` parts (upper arm, forearm, hand) hold
     * the gun with their own arms (IK), others show the gun alone.
     */
    async setCharacter(url: string) {
        const character = await Character.load(url);
        const body = await Model.load(this.gl, character.model, { skin: character.skin });
        this.body?.destroy?.();
        this.character = character; this.body = body;
        const names: Record<Move, string[]> = { idle: ["Idle", "idle"], walk: ["Walking", "walk"], run: ["Run", "run"], jump: ["Jump", "jump"] };
        this.clips = Object.fromEntries((Object.keys(names) as Move[]).map(k => [k, [character.json.clips?.[k], ...names[k]].find(n => n && body.animation(n))]));
        this.attachments = new Attachments(this.gl, character);
        const skin = body.skin as unknown as SkinLike & { bones: { name: string }[] };
        const parts = character.parts;
        // baked rigs carry no controls: make the ones the base rig names (no-op where the file has them)
        for (const c of character.base?.controls ?? []) skin.addIK?.(c.bone, c);
        const chain = (side: "L" | "R") => { const p = parts[`arm.${side}`] ?? [], n = p.slice(-3); return n.length === 3 && n.every(b => skin.armature.find(b)) ? n as [string, string, string] : undefined; };
        const r = chain("R"), l = chain("L");
        const ar = r && bodyArm(skin, r, "R"), al = l && bodyArm(skin, l, "L");
        this.bodyArms = r && l ? [r, l] : undefined;
        this.rigArms = ar && al ? [ar, al] : undefined;
        const armBones = new Set<string>();
        for (const side of ["arm.L", "arm.R"]) for (const n of parts[side] ?? []) for (const b of below(skin.armature.find(n))) armBones.add(b.name);
        const head = new Set([...(character.json.firstPerson?.hide ?? []), ...(parts.head ?? [])]);
        const index = (test: (name: string) => boolean) => skin.bones.map((b, i) => test(b.name) ? i : -1).filter(i => i >= 0);
        // the world pass: no head, no arms (the arms come with the gun, on its depth)
        this.hidden = index(n => head.has(n) || armBones.has(n) || /Thumb|Finger|MiddleHand/.test(n));
        // the gun's pass: only the arms
        this.onlyArms = this.rigArms ? index(n => !armBones.has(n)) : [];
    }
    /** body arm chains [right, left] (upper arm, forearm, hand) */
    private bodyArms?: [[string, string, string], [string, string, string]];
    /** the arms with their rig controls (IK, the hand copies the control's rotation), [right, left] */
    private rigArms?: [BodyArm, BodyArm];
    private onlyArms: number[] = [];

    /** the hand pose of a carried gun (hand editor, weapon.json `hands`) */
    handsOf(index: number): HandsFile {
        const c = this.carried[index], pose = c.arms ?? armsPoseOf(ARMS), h = c.hands ?? c.hold;
        return { grip: [...h.grip], fore: h.fore && [...h.fore], hip: [...c.hold.hip], hipAngle: [...(c.hold.hipAngle ?? [0, 0, 0])], turn: c.turn && [[...c.turn[0]], [...c.turn[1]]], shoulder: [[...pose.shoulder[0]], [...pose.shoulder[1]]], elbow: [[...pose.elbow[0]], [...pose.elbow[1]]] };
    }
    setHands(index: number, h: HandsFile) {
        const c = this.carried[index];
        c.hands = { grip: h.grip, fore: c.hold.fore && (h.fore ?? c.hold.fore) };
        if (h.hip) c.hold.hip = h.hip;
        if (h.hipAngle) c.hold.hipAngle = h.hipAngle;
        if (h.turn) c.turn = h.turn;
        c.arms = { shoulder: h.shoulder, elbow: h.elbow };
    }
    resetHands(index: number) {
        const c = this.carried[index];
        c.hold.hip = [...c.base]; c.hold.hipAngle = undefined; c.hands = undefined; c.arms = undefined; c.turn = undefined;
    }

    /** the body holds the gun with its own arms (no drawn box arms) */
    get bodyHolds() { return !!this.rigArms && !!this.body && this.showBody; }
    /** camera space shoulder of the body's arm (0 right, 1 left), undefined without body arms */
    shoulderOf(side: 0 | 1): Vec3 | undefined {
        const skin = this.body?.skin as unknown as SkinLike | undefined, cam = this.camera?.worldMatrix;
        if (!this.bodyHolds || !skin || !cam) return undefined;
        const b = skin.armature.find(this.bodyArms![side][0]) as unknown as { head: ArrayLike<number> } | undefined;
        if (!b) return undefined;
        const w = this.bodyMatrix().multiply(this.body!.skeletonMatrix).multiply([b.head[0], b.head[1], b.head[2], 1]) as unknown as number[];
        return point(invertRigid(mat4(), cam), [w[0], w[1], w[2]]);
    }
    get armsLook() { return ARMS; }
    get held() { return this.carried[this.current]; }
    get gun() { return this.held?.gun; }

    /** a toggled part of the gun (`press` flips it): `pair` [on, off] clips, or `single` played forward on, backward off */
    private part(model: Model, name: string, press: boolean, dt: number, pair: [string, string], single: string) {
        const two = !!model.animation(pair[0]), one = !two && !!model.animation(single);
        if (!two && !one) return;
        const key = `${this.current}:${name}`;
        let st = this.toggles.get(key);
        if (!st) this.toggles.set(key, st = { on: false, t: 99 });
        if (press) { st.on = !st.on; st.t = 0; }
        st.t += dt;
        if (two)
        {
            const clip = st.on ? pair[0] : pair[1], len = model.animation(clip)!.duration;
            // off at rest = frame 0 of the on clip
            if (st.on || st.t < len) model.layer(clip, Math.min(st.t, len));
            return;
        }
        const len = model.animation(single)!.duration, t = Math.min(st.t, len);
        model.layer(single, st.on ? t : len - t);
    }

    /**
     * A break action's pose from its barrels: opened through the reload (the fired cases out, held, new rounds in,
     * closed), then per barrel the hammer, a spent case, the trigger pull and the safety.
     */
    private breakPose(model: Model, gun: Gun, b: NonNullable<GunAnimation["break"]>, fps: number, held: boolean, dt: number) {
        const p = gun.progress, len = (n: string) => model.animation(n)?.duration ?? 0;
        const open = gun.reloading <= 0 ? 0 : p < .18 ? p / .18 : p < .82 ? 1 : 1 - (p - .82) / .18;
        model.pose(b.open, open * len(b.open), false);
        gun.barrels!.forEach((barrel, i) => {
            const n = b.barrels[i], name = (t: string) => t.replace("{b}", n);
            const swap = gun.swapping.includes(i);
            // swapped: case out (.2..4), held out, the new round in (reversed, .6..8)
            if (swap && gun.reloading > 0)
            {
                const s = p < .2 ? 0 : p < .4 ? (p - .2) / .2 : p < .6 ? 1 : p < .8 ? 1 - (p - .6) / .2 : 0;
                model.layer(name(b.swap), s * len(name(b.swap)));
            }
            const fresh = swap && gun.reloading > 0 && p >= .5;
            if (barrel.spent && !fresh) model.layer(name(b.spent), 0);
            // the hammer coming back (its `cock` clip), then held back
            const cock = b.cock && name(b.cock);
            if (barrel.cocked && cock && barrel.cocking < len(cock)) model.layer(cock, barrel.cocking);
            else if (barrel.cocked) model.layer(name(b.cocked), 0);
            const pull = gun.pull;
            if (pull?.barrel === i)
            {
                const shoot = name(b.shoot), d = len(shoot), span = .07, t = Math.min(1, pull.since / span) * d;
                const pulled = (b.pulled ?? 1) / fps;
                if (pull.fired && pull.since < span) model.layer(shoot, t);
                else if (held || pull.since < span) model.layer(shoot, Math.min(t, pulled), b.trigger ? [name(b.trigger)] : undefined);
            }
        });
        // the safety slides over its clip's length
        if (!b.safety) return;
        const d = len(b.safety.replace("{b}", b.barrels[0])) || .1;
        this.safety = Math.max(0, Math.min(d, this.safety + (gun.safe ? dt : -dt)));
        if (this.safety > 0) for (const n of b.barrels) model.layer(b.safety.replace("{b}", n), this.safety);
    }
    /** seconds into the safety clip (0 off) */
    private safety = 0;

    /** weapon.json clip timeline (`reload` / `reloadEmpty` pieces, `shoot.last`): false when the file has none for now */
    private stepPose(model: Model, gun: Gun, anim: GunAnimation | undefined) {
        if (!anim) return false;
        const fps = anim.fps ?? 24;
        if (gun.reloading > 0)
        {
            const steps = gun.emptyReload ? anim.reloadEmpty ?? anim.reload : anim.reload;
            if (!steps) return false;
            let p = gun.progress, i = 0;
            const total = steps.reduce((a, s) => a + s.share, 0);
            p *= total;
            while (i < steps.length - 1 && p > steps[i].share) p -= steps[i++].share;
            const s = steps[i], f = Math.min(1, p / s.share);
            if (s.hold) model.pose(s.hold, model.animation(s.hold)?.duration ?? 0, false);
            else if (s.clip)
            {
                const [a, b] = span(model, s, fps), t = s.reverse ? b + (a - b) * f : a + (b - a) * f;
                model.pose(s.clip, t, false);
            }
            if (s.over) model.layer(s.over.clip, (s.over.frame ?? 0) / fps, s.over.only);
            return true;
        }
        // the last round: its own clip, then held at its end while empty
        const last = anim.shoot?.last, clip = last && model.animation(last);
        if (!clip || gun.rounds > 0) return false;
        const shoot = model.animation(anim.shoot?.clip ?? "shoot"), sc = shoot && shoot.duration > 0 ? clip.duration / shoot.duration : 1;
        const len = Math.min(clip.duration, Math.max(.08, gun.spec.interval * .85) * sc);
        model.pose(last, Math.min(1, gun.sinceShot / len) * clip.duration, false);
        return true;
    }

    select(index: number) {
        if (!this.carried[index]) return;
        this.held?.gun.cancel();
        this.current = index;
        this.vm.set(this.carried[index].hold);
        // sounds load when a gun is first taken up (all of them at once is ~20 MB)
        void this.feel.audio.load(this.carried[index].gun.spec.sounds ?? this.carried[index].gun.spec.model);
    }

    /** put on the engine camera: `new Camera({ controllers: [player.controller] })` */
    readonly controller: CameraController = {
        start: (camera: Camera) => {
            const canvas = camera.surface!.element as HTMLElement;
            this.input = new Input(canvas);
            this.input.onexit = () => this.events.exit?.();
            this.input.lock();
            this.yaw = camera.rotation[1];
            this.pitch = camera.rotation[0];
        },
        update: (camera: Camera, dt: number) => this.update(camera, Math.min(dt, .1)),
        destroy: () => { this.input?.destroy(); this.input = undefined; },
    };

    /** the camera of the last update (cues need it) */
    private camera?: Camera;

    update(camera: Camera, dt: number) {
        this.camera = camera;
        const input = this.input, carried = this.held;
        const { dx, dy, wheel, pressed } = input?.consume() ?? { dx: 0, dy: 0, wheel: 0, pressed: new Set<string>() };
        const k = (...n: string[]) => input?.key(...n) ? 1 : 0;
        const gun = carried?.gun;
        if (pressed.has("alt")) this.toggled = !this.toggled;
        const optic = this.optic;
        const aiming = !optic && (this.toggled || !!input?.buttons.has(2));
        const scoped = !!carried?.scope && (gun?.aimed ?? 0) > .5;
        // aimed down a scope, the mouse turns slower (by the zoom)
        // through an optic the mouse is not slowed: real hands don't get steadier with zoom
        const sense = (this.setting.sensitivity ?? .0022) / (optic ? 1 : scoped ? carried!.scope!.zoom * .8 : 1 + (gun?.aimed ?? 0) * .3);
        const turnYaw = -dx * sense, turnPitch = -dy * sense;
        this.yaw += turnYaw;
        this.pitch = Math.max(-LIMIT, Math.min(LIMIT, this.pitch + turnPitch));
        // the climb of recoil stays until pulled down, eases off slowly
        this.climb *= Math.exp(-dt * 1.5);

        // switching and zoom
        for (let i = 1; i <= 9; i++) if (pressed.has(String(i))) this.select(i - 1);
        if (pressed.has("[") || pressed.has("]")) this.select((this.current + (pressed.has("]") ? 1 : -1) + this.carried.length) % this.carried.length);
        if (wheel && scoped)
        {
            const [lo, hi] = carried!.zoom!; carried!.scope!.zoom = Math.max(lo, Math.min(hi, carried!.scope!.zoom * (wheel < 0 ? 1.15 : 1 / 1.15)));
        }
        if (pressed.has("r")) gun?.reload();

        // walking
        const ahead = k("w", "arrowup") - k("s", "arrowdown"), side = k("d", "arrowright") - k("a", "arrowleft");
        const sprint = !!k("shift") && ahead > 0 && !aiming;
        if (sprint) this.toggled = false;
        // lean: the eye out to the side and the view rolled (not while running)
        const leanTo = sprint ? 0 : k("e") - k("q");
        this.lean += (leanTo - this.lean) * (1 - Math.exp(-dt * 9));
        const l = Math.max(1, Math.hypot(ahead, side));
        const v = (this.setting.speed ?? 4.2) * (sprint ? this.setting.run ?? 2 : 1) * (1 - (gun?.aimed ?? 0) * .45);
        const y = this.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
        let wx = (fx * ahead + rx * side) / l * v, wz = (fz * ahead + rz * side) / l * v;
        // aiming into a wall: no walking into it, the body backs off softly until the barrel fits (up to BACK_OFF);
        // no room behind, it tucks as usual
        const into = this.obstruction.value.into, aimingIn = !!gun && aiming && !sprint && into > 0;
        this.room = false;
        if (aimingIn)
        {
            const ahead2 = wx * fx + wz * fz;
            if (ahead2 > 0) { wx -= fx * ahead2; wz -= fz * ahead2; }
            const f = this.mover.feet, from: Vec3 = [f[0], f[1] + 1.1, f[2]];
            this.room = this.backed < BACK_OFF && !this.setting.cast(from, [from[0] - fx * .45, from[1], from[2] - fz * .45]);
            if (this.room)
            {
                const speed = Math.min(1.6, into * 8);
                wx -= fx * speed; wz -= fz * speed; this.backed += speed * dt;
            }
        }
        else if (!aiming) this.backed = 0;
        if (this.opticEye) { wx = 0; wz = 0; }
        this.mover.update(dt, { x: wx, z: wz, jump: !!k(" ") && !this.opticEye });
        const m = this.mover;

        // the gun
        if (gun)
        {
            gun.aim(aiming && !sprint);
            // break actions: C pulls the hammers back, X the safety
            if (pressed.has("c")) gun.cock();
            if (gun.barrels && pressed.has("x")) gun.toggleSafety();
            const event = sprint || optic ? gun.trigger(false) : gun.trigger(!!input?.buttons.has(0));
            if (event === "shot") this.fire(camera, gun);
            gun.update(dt);
            const pose = carried.model;
            const brk = carried.weapon?.animation?.break;
            if (gun.barrels && brk && pose.animation(brk.open)) this.breakPose(pose, gun, brk, carried.weapon!.animation!.fps ?? 24, !!input?.buttons.has(0), dt);
            else if (!this.stepPose(pose, gun, carried.weapon?.animation)) pose.pose(...gunClip(pose, gun, carried.weapon?.animation?.rest as string | undefined), false);
            // toggled parts on top of the clip: V the iron sight, B the stock (one clip played back = off, or an up / down pair)
            const tg = carried.weapon?.animation?.toggles as Record<string, { key: string; clip?: string; on?: string; off?: string }> | undefined;
            const sight = tg?.sight, stock = tg?.stock;
            this.part(pose, "sight", pressed.has(sight?.key ?? "v"), dt, [sight?.on ?? "iron-scope-up", sight?.off ?? "iron-scope-down"], sight?.clip ?? "ironscope");
            this.part(pose, "stock", pressed.has(stock?.key ?? "b"), dt, [stock?.on ?? "stock-fold", stock?.off ?? "stock-unfold"], stock?.clip ?? "foldstock");
            // the rounds shown in the magazine drop away when it's empty (until the new one is in)
            if (pose.animation("empty-mag") && gun.rounds === 0 && !(gun.reloading > 0 && gun.progress > .55)) pose.layer("empty-mag", 0);
            this.spread = gun.spread(m.speed / 4.2);
        }
        const strafe = m.velocity[0] * rx + m.velocity[2] * rz;
        this.vm.update(dt, { yaw: turnYaw, pitch: turnPitch, speed: m.speed, strafe, grounded: m.grounded, landed: m.landed, aimed: gun?.aimed ?? 0, reload: gun && gun.reloading > 0 ? gun.progress : -1, sprint });
        // the barrel against the world (from last frame's camera)
        if (gun) { const f = this.vm.free, o = this.obstruction.update(camera.worldMatrix, f.grip, f.muzzle, this.pitch); this.vm.obstruct(this.room && o.tuck ? { yaw: 0, back: o.back, tuck: 0 } : o); }
        else this.vm.obstruct({ yaw: 0, back: 0, tuck: 0 });
        // the support hand lets go of the gun onto a wall / rail: not aimed and tucked, sprinting / reloading or one handed
        {
            const hands = this.held && (this.held.hands ?? this.held.hold);
            const free = !!this.rigArms && this.bodyHolds && (gun?.aimed ?? 0) < .1 && (!hands?.fore || this.vm.tucked > .5 || this.vm.away > .5);
            // the shoulder joint, a little under the eye: the hand goes on the wall about neck high
            const shoulder: Vec3 = [m.feet[0] - rx * .18, m.feet[1] + this.eye - .12, m.feet[2] - rz * .18];
            this.brace.update(dt, shoulder, [fx, 0, fz], [-rx, 0, -rz], free);
        }

        camera.zoom = 1 + (scoped ? 0 : (gun?.aimed ?? 0) * .25);
        const out = this.lean * LEAN;
        camera.position.set([m.feet[0] + rx * out, m.feet[1] + this.eye - Math.abs(this.lean) * .06, m.feet[2] + rz * out]);
        camera.rotation.set([this.pitch + this.climb + this.vm.view[0], this.yaw + this.vm.view[1], -this.lean * LEAN_ROLL]);
        if (optic)
        {
            const o = optic.update(dt, [turnPitch, turnYaw]);
            camera.zoom = optic.zoom;
            if (this.opticEye) camera.position.set(this.opticEye);
            camera.rotation.set([this.pitch + o[0], this.yaw + o[1], 0]);
        }

        const p = this.pitch, ya = this.yaw;
        this.feel.update(dt, [camera.position[0], camera.position[1], camera.position[2]], [-Math.sin(ya) * Math.cos(p), Math.sin(p), -Math.cos(ya) * Math.cos(p)]);
        this.bullets.update(dt);
        this.impacts.update(dt);
        this.impacts.tracers(this.bullets.list.filter(b => b.tracer));
        this.animateBody(dt);
    }

    /** a cue of a gun: only the held one is heard / throws cases (a switched away gun's cues were dropped) */
    private cue(cue: Cue, gun: Gun) {
        const carried = this.held;
        if (!carried || carried.gun !== gun || !this.camera) return;
        const cam = this.camera.worldMatrix, world = this.vm.world(cam, this.cam), m = this.mover;
        this.feel.cue(cue, gun, { world, muzzle: point(cam, this.vm.muzzle.from), velocity: [m.velocity[0], m.velocity[1], m.velocity[2]], eject: carried.weapon?.points?.eject, ejectDir: carried.weapon?.points?.ejectDir });
    }

    private fire(camera: Camera, gun: Gun) {
        const cam = camera.worldMatrix, c = gun.caliber, carried = this.held, hold = carried.hold, vm = this.vm.matrix;
        const zero = carried.zero ?? gun.spec.zero;
        // more barrels: the one that fired
        const barrel = gun.pull && carried.weapon?.points?.barrels?.[gun.pull.barrel];
        const muzzle = point(vm, barrel || hold.muzzle);
        const from = point(cam, muzzle);
        // hip: down the bore, tipped up so it meets the sights' height at the zero
        const bore = this.vm.muzzle.direction;
        const hip = tip(bore, zeroAngle(c.speed, c.drag, zero, Math.max(0, hold.sight[1] - hold.muzzle[1])));
        // aimed: through the point the drawn sights (rear -> front) look at, `zero` ahead, plus the drop there
        // (a real gun's sights are filed to its barrel: off points or a hand tune can't throw it off)
        const s = point(vm, hold.sight), f = point(vm, hold.front ?? [hold.sight[0], hold.sight[1], hold.muzzle[2]]);
        const line = unit([f[0] - s[0], f[1] - s[1], f[2] - s[2]]);
        const at = [s[0] + line[0] * zero, s[1] + line[1] * zero, s[2] + line[2] * zero];
        const aimed = tip(unit([at[0] - muzzle[0], at[1] - muzzle[1], at[2] - muzzle[2]]), zeroAngle(c.speed, c.drag, zero, 0));
        const a = gun.aimed * (1 - this.vm.tucked);
        let d = direction(cam, unit([hip[0] + (aimed[0] - hip[0]) * a, hip[1] + (aimed[1] - hip[1]) * a, hip[2] + (aimed[2] - hip[2]) * a]));
        const up = direction(cam, [0, 1, 0]), right = direction(cam, [1, 0, 0]);
        const [sx, sy] = gun.scatter(this.mover.speed / 4.2);
        const tracer = !gun.spec.auto || this.tracerCount++ % 3 === 0;
        // a shot shell throws `pellets` balls in their own cone round the shot's line (one tracer)
        const balls = c.pellets ?? 1;
        for (let i = 0; i < balls; i++)
        {
            const r = balls > 1 ? (c.pelletSpread ?? .03) * Math.sqrt(Math.random()) : 0, t = Math.random() * Math.PI * 2;
            const px = sx + Math.cos(t) * r, py = sy + Math.sin(t) * r;
            const ball = unit([d[0] + up[0] * py + right[0] * px, d[1] + up[1] * py + right[1] * px, d[2] + up[2] * py + right[2] * px]);
            this.bullets.fire({ from, direction: ball, speed: c.speed * (balls > 1 ? .95 + Math.random() * .1 : 1), drag: c.drag, life: c.life, tracer: tracer && i === 0, data: { gun: gun.spec.model } });
        }
        this.impacts.flash(from, direction(cam, bore), gun.spec.flash ?? (gun.spec.kind === "pistol" ? .08 : c.pellets || gun.spec.caliber === "20x138b" ? .3 : .14));
        const recoil = gun.recoil();
        this.vm.fire(recoil);
        this.climb += recoil.climb;
        this.pitch = Math.min(LIMIT, this.pitch + recoil.climb * .5);
        this.yaw += recoil.side * .3;
        this.shots++;
    }

    private animateBody(dt: number) {
        const body = this.body;
        if (!body) return;
        const m = this.mover;
        const move = !m.grounded && m.airTime > .15 ? "jump" : m.speed < .3 ? "idle" : m.speed < 5 ? "walk" : "run";
        if (move !== this.move) { this.move = move; this.bodyTime = 0; }
        this.bodyTime += dt * (move === "walk" ? Math.max(.6, m.speed / 3.2) : move === "run" ? m.speed / 7 : 1);
    }

    private posed?: Float32Array;

    /** bends the body's arms onto the held gun's hands (skin space), elbows toward the arm poses */
    private reachGun(skin: SkinLike, cam: ArrayLike<number>, carried: Carried) {
        const toSkin = this.bodyMatrix().multiply(this.body!.skeletonMatrix).clone.inverse();
        const local = (p: Vec3): Vec3 => { const v = toSkin.clone.multiply([p[0], p[1], p[2], 1]) as unknown as number[]; return [v[0], v[1], v[2]]; };
        const along = (d: Vec3): Vec3 => { const a = local([0, 0, 0]), b = local(d); return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; };
        const camDir = (d: Vec3) => direction(cam, d);
        const hands = carried.hands ?? carried.hold, lag = this.vm.lag;
        const at = (p: Vec3) => local(point(cam, point(this.vm.matrix, p)));
        // camera space: the trigger elbow out, a little down (aimed "down" or "back" would bring it by the eye),
        // the support elbow down under the gun
        const pole = (i: 0 | 1): Vec3 => along(camDir(i ? [-.3 - lag[0], -1 + lag[1], 0] : [1 - lag[0], -.35 + lag[1], 0]));
        // the torso follows the view's pitch (most of it)
        bend(skin, ["spine", "spine.1", "chest"], [.25, .25, .3], [1, 0, 0], -this.pitch);
        const turn = carried.turn ?? [[0, 0], [0, 0]], r = Math.PI / 180;
        // gun space directions -> skin space (through the gun's sway and the camera)
        const dir = (d: Vec3) => along(camDir(direction(this.vm.matrix, d)));
        const hand = (i: 0 | 1, p: Vec3, frame: HandFrame, trigger?: Vec3) => {
            const f = turnFrame(frame, turn[i][0] * r, (i ? -1 : 1) * turn[i][1] * r);
            const arm = this.rigArms![i], rotation = holdRotation(arm, dir(f.axis), dir(f.palm));
            const wrist = reach(skin, arm, at(p), rotation, pole(i));
            grip(skin, arm, f.radius, trigger && { at: at(trigger), wrist, rotation });
        };
        // pistols and pistol grip guns (smgs) by their grip, rifles by the stock's wrist; the index on the trigger
        const trigger = carried.weapon?.points?.trigger ?? bonePoint(carried.model, "trigger");
        hand(0, hands.grip, carried.gun.spec.kind === "rifle" ? WRIST_GRIP : PISTOL_GRIP, trigger);
        const b = this.brace.value;
        if (b.weight > .01)
        {
            // the support hand from the gun (or hanging) onto the wall / rail
            const arm = this.rigArms![1], n = b.normal;
            const palm = along([-n[0], -n[1], -n[2]]);
            // wall: fingers up it; rail: along it (thumb forward), palm on it
            const onIt = b.bar ? holdRotation(arm, along([n[2], 0, -n[0]]), palm) : handRotation(arm, along([0, 1, 0]), palm);
            const wall = local(b.point.clone.add(n.clone.multiply(.01)) as unknown as Vec3);
            let target = new Vector3(wall[0], wall[1], wall[2]), rotation = onIt;
            if (hands.fore)
            {
                const f = turnFrame(FORE_HAND, turn[1][0] * r, -turn[1][1] * r);
                target = new Vector3(...at(hands.fore)).lerp(target, b.weight);
                rotation = holdRotation(arm, dir(f.axis), dir(f.palm)).slerp(onIt, b.weight);
            }
            reach(skin, arm, target, rotation, pole(1));
            if (b.weight > .5) { if (b.bar) grip(skin, arm, .02); else flat(skin, arm); }
            else if (hands.fore) grip(skin, arm, FORE_HAND.radius);
        }
        else if (hands.fore) hand(1, hands.fore, FORE_HAND);
        else release(skin, this.rigArms![1]);
        skin.update();
    }

    /** where the body is drawn: at the feet, facing the view, a little back so the eye doesn't look into it */
    private bodyMatrix() {
        const c = this.character!, s = c.json.scale ?? 1, f = this.mover.feet, y = this.yaw;
        // aimed, the head goes forward onto the stock: the body (head hidden) goes back under the eye
        const back = .06 + .1 * (this.held?.gun.aimed ?? 0);
        return Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, f[0] + Math.sin(y) * back, f[1], f[2] + Math.cos(y) * back, 1])
            .multiply(Matrix4.rotationY(y + Math.PI))
            .multiply(Matrix4.create([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]));
    }

    /**
     * Draw after the world (same `renderer.begin`): the body, impacts, then (scoped) the scope's picture,
     * then the gun and arms on their own depth so they never go into walls, and the scope glass on top.
     */
    draw(camera: Camera) {
        const r = this.renderer, gl = this.gl, carried = this.held;
        if (this.body && this.showBody)
        {
            this.body.pose(this.clips[this.move] ?? this.clips.idle, this.bodyTime, this.move !== "jump" || !this.clips.jump);
            const skin = this.body.skin as unknown as SkinLike | undefined;
            if (skin && this.rigArms) { if (carried) this.reachGun(skin, camera.worldMatrix, carried); else this.rigArms.forEach(a => release(skin, a)); }
            this.posed = skin ? skin.matrices.slice() : undefined;
            if (skin) collapse(skin, this.hidden);
            this.body.draw(r, this.bodyMatrix());
        }
        this.feel.draw(r);
        const held = this.held;
        if (held) this.impacts.follow(point(camera.worldMatrix, point(this.vm.matrix, held.hold.muzzle)), direction(camera.worldMatrix, this.vm.muzzle.direction));
        this.impacts.draw(camera);
        r.reset();
        this.setting.worldDrawn?.();
        if (!carried || this.optic) return;
        const aspect = camera.width / camera.height, scope = carried.scope;
        const fov = 2 * Math.atan(Math.tan(camera.fov / 2) / camera.zoom);
        perspective(this.near, fov, aspect, .01, 20);
        // the glass is there from the start of the raise, black; the picture comes in as the eye gets behind it
        const aimed = carried.gun.aimed * (1 - this.vm.tucked), light = smoothstep(.55, .95, aimed);
        const showGlass = !!scope && aimed > .02;
        const showScope = showGlass && light > 0 && !!this.setting.scene;
        if (showScope)
        {
            const view = scope!.begin(camera.worldMatrix, this.vm.matrix, this.near, .1, camera.far);
            r.begin(view, [.6, .7, .8, 1]);
            this.setting.scene!(view);
            this.impacts.draw(view);
            scope!.end();
            r.reset();
        }
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const cam = camera.worldMatrix;
        r.begin({ viewMatrix: camera.viewMatrix, projectionMatrix: this.near, worldPosition: camera.worldPosition }, null);
        const world = Matrix4.create(Array.from(this.vm.world(cam)));
        carried.model.draw(r, world);
        if (carried.scopeModel && carried.scopeAt) carried.scopeModel.draw(r, world.clone.multiply(carried.scopeAt));
        if (carried.scopeMesh) r.draw(carried.scopeMesh, world);
        const skin = this.body?.skin as unknown as SkinLike | undefined;
        if (this.body && this.showBody && skin && this.rigArms && this.posed)
        {
            skin.matrices.set(this.posed);
            collapse(skin, this.onlyArms);
            this.body.draw(r, this.bodyMatrix());
        }
        r.reset();
        if (showGlass) scope!.overlay(this.vm.matrix, this.near, aspect, showScope ? light : 0);
    }

    destroy() {
        this.input?.destroy();
        this.impacts.destroy();
        for (const c of this.carried) { c.model.destroy(); c.scope?.destroy(); c.scopeMesh?.destroy(); c.scopeModel?.destroy(); }
        this.body?.destroy();
        this.feel.destroy();
    }
}

/** a weapon.json `aim` (degrees) as a `Hold.aim` (radians) */
export function aimOf(t: AimTune): NonNullable<Hold["aim"]> {
    const r = Math.PI / 180;
    return { offset: [...t.offset], angle: [t.angle[0] * r, t.angle[1] * r, t.angle[2] * r] };
}

function unit(v: ArrayLike<number>): Vec3 {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

/** camera space direction turned up by `angle` (about camera x) */
function tip(d: Vec3, angle: number): Vec3 {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [d[0], d[1] * c - d[2] * s, d[1] * s + d[2] * c];
}

/** a clip piece's [from, to] seconds */
function span(model: Model, s: ClipStep, fps: number): [number, number] {
    const d = model.animation(s.clip ?? s.hold ?? "")?.duration ?? 0;
    return [s.from !== undefined ? s.from / fps : 0, s.to !== undefined ? s.to / fps : d];
}

/** the cues of clip pieces as a 0..1 timeline of the reload */
function stepCues(model: Model, steps: ClipStep[], fps: number): [number, Cue][] {
    const total = steps.reduce((a, s) => a + s.share, 0), out: [number, Cue][] = [];
    let start = 0;
    for (const s of steps)
    {
        const [a, b] = span(model, s, fps);
        for (const [cue, frame] of Object.entries(s.cues ?? {}))
        {
            const k = b > a ? (frame / fps - a) / (b - a) : 0;
            out.push([(start + Math.max(0, Math.min(1, s.reverse ? 1 - k : k)) * s.share) / total, cue as Cue]);
        }
        start += s.share;
    }
    return out.sort((x, y) => x[0] - y[0]);
}

function smoothstep(a: number, b: number, x: number) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** shrinks bones onto their own joint (no spikes from shared vertices) */
function collapse(skin: SkinLike, bones: number[]) {
    for (const i of bones)
    {
        const h = (skin.bones[i] as unknown as { head: ArrayLike<number> }).head;
        skin.matrices.fill(0, i * 16, i * 16 + 16);
        skin.matrices[i * 16 + 12] = h[0]; skin.matrices[i * 16 + 13] = h[1]; skin.matrices[i * 16 + 14] = h[2]; skin.matrices[i * 16 + 15] = 1;
    }
}
type AnyBone = { name: string; children: AnyBone[] };
const below = (b: AnyBone | null | undefined): AnyBone[] => b ? [b, ...b.children.flatMap(below)] : [];

/**
 * The held gun's clip and time: its own `reload` / `reload-empty` if it has one, a pistol's `magazine-eject` + `clock`, else a bolt gun's `cycle` opens, holds open
 * while the rounds go in and closes; after a shot `shoot` (the jolt), then `cycle` through the `interval`.
 */
function gunClip(model: Model, gun: Gun, rest?: string): [string | undefined, number] {
    const has = (n: string) => !!model.animation(n), cycle = model.animation("cycle");
    const len = cycle?.duration ?? 1;
    if (gun.reloading > 0)
    {
        const insert = model.animation("insert-mag");
        if (insert && !has("reload") && !has("reload-empty"))
        {
            // `eject-mag` (if any) takes the magazine out, held out, then `insert-mag` (frame 0 out, 4 in, the bolt to 9)
            const p = gun.progress, f = (n: number) => n / 24, end = Math.min(insert.duration, f(9)), eject = model.animation("eject-mag");
            if (eject)
            {
                if (p < .35) return ["eject-mag", p / .35 * eject.duration];
                if (p < .55) return ["eject-mag", eject.duration];
            }
            else
            {
                // no eject clip: insert-mag 4..0 backwards
                if (p < .12) return ["insert-mag", f(4) * (1 - p / .12)];
                if (p < .55) return ["insert-mag", 0];
            }
            if (p < .7) return ["insert-mag", f(4) * (p - .55) / .15];
            if (p < .88) return ["insert-mag", f(4) + (end - f(4)) * (p - .7) / .18];
            return ["insert-mag", end];
        }
        const own = gun.emptyReload && has("reload-empty") ? "reload-empty" : "reload";
        if (has(own)) return [own, gun.progress * (model.animation(own)!.duration)];
        // pistol: magazine out, held, back in (eject reversed), then the slide racked (`clock`)
        const eject = model.animation("magazine-eject") ?? model.animation("mag-eject"), clock = model.animation("clock");
        // only a magazine-out clip: out, held, back in (reversed)
        if (eject && !clock)
        {
            const p = gun.progress, e = eject.duration, n = eject.name!;
            if (p < .25) return [n, p / .25 * e];
            if (p < .65) return [n, e];
            if (p < .85) return [n, (1 - (p - .65) / .2) * e];
            return [n, 0];
        }
        if (eject && clock)
        {
            const p = gun.progress, e = eject.duration;
            const n = eject.name!;
            if (p < .15) return [n, p / .15 * e];
            if (p < .55) return [n, e];
            if (p < .7) return [n, (1 - (p - .55) / .15) * e];
            return ["clock", (p - .7) / .3 * clock.duration];
        }
        if (!cycle) return [undefined, 0];
        // open (0..40% of the clip), held open, closed at the end
        const p = gun.progress;
        return ["cycle", (p < .1 ? p / .1 * .4 : p < .82 ? .4 + (p - .1) / .72 * .2 : .6 + (p - .82) / .18 * .4) * len];
    }
    const s = gun.sinceShot, interval = gun.spec.interval;
    if (cycle && gun.action !== "semi" && gun.action !== "auto" && gun.action !== "pistol" && s < interval)
    {
        const f = (s / interval - .2) / .8;
        if (f > 0) return ["cycle", Math.min(1, f) * len];
    }
    // `shoot` runs from the shot itself and is over before the next one (a pistol's slide is back and home within the interval)
    const shoot = model.animation("shoot");
    if (shoot)
    {
        const span = Math.min(shoot.duration, Math.max(.08, interval * .85));
        if (s < span) return ["shoot", s / span * shoot.duration];
    }
    // rest: weapon.json `animation.rest` (e.g. `loaded`, hammer cocked), else frame 0
    if (rest && has(rest)) return [rest, 0];
    return [cycle ? "cycle" : has("shoot") ? "shoot" : undefined, 0];
}
