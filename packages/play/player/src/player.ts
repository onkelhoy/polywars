import type { Camera, CameraController, Layer3D } from "@papit/game-engine";
import { upload, type GPUMesh } from "@papit/game-mesh";
import { Matrix4 } from "@papit/matrix";
import { Bullets, zeroAngle } from "@polywar/ballistics";
import { Attachments, Character } from "@polywar/characters";
import { Impacts } from "@polywar/impacts";
import { Mover } from "@polywar/mover";
import { Model, type Renderer } from "@polywar/renderer";
import { direction, invertRigid, mat4, perspective, point, Scope, ViewModel, type Hold, type Vec3 } from "@polywar/viewmodel";
import { Gun, GUNS, type Cue } from "@polywar/weapons";
import { Armory, type AimTune, type WeaponFile } from "@polywar/armory";
import { Arms, armsPoseOf, type ArmsPose } from "./arms";
import { reach, type SkinLike } from "./body-arms";
import type { HandsFile } from "./weapon-editor";
import { Feel } from "./feel";
import { holdOf, scopeMountFor, scopeMountOf } from "./holds";
import { Input } from "./input";
import type { PlayerEvents, PlayerSetting } from "./types";

/** `scopeModel` (a scope from the armory) is drawn `scopeAt` off the gun; `scopeMesh` is the stand-in without one */
type Carried = { gun: Gun; model: Model; hold: Hold; weapon?: WeaponFile; tune: { model: string; key: string }; zero?: number; scope?: Scope; zoom?: [number, number]; scopeModel?: Model; scopeAt?: Matrix4; scopeMesh?: GPUMesh; arms?: ArmsPose; turn?: [[number, number], [number, number]]; hands?: { grip: Vec3; fore?: Vec3 }; base: Vec3 };

const LIMIT = Math.PI / 2 - .02;
/** lean: metres the eye goes out, radians the view rolls */
const LEAN = .32, LEAN_ROLL = .2;

/**
 * A playable character in first person: walks on the host's ground (`@polywar/mover`), looks with the mouse,
 * carries guns (`@polywar/weapons`) held by a `ViewModel` with arms, fires real bullets (`@polywar/ballistics`)
 * that leave tracers, bits and marks (`@polywar/impacts`), a scope with its own picture for scoped guns.
 * Its body (a `character.json`) is drawn under the view, head and arms left out.
 *
 * Keys: WASD walk, shift run, space jump, left mouse fire, right mouse aim (held) or Option / Alt (toggle),
 * Q / E lean, R reload, 1..9 / wheel switch guns (wheel zooms a scope while aimed), Esc lets go of the mouse.
 * Guns are `GUNS` ids, `<id>@<scope>` puts a scope from `assets/models/weapons/attachments/` on (e.g. `kar98k@scope-2`).
 */
export class Player {
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
    private arms: Arms;
    private gl: WebGL2RenderingContext;
    private eye: number;
    private bodyTime = 0;
    private clip = "Idle";
    private climb = 0;
    private near = mat4();
    private hidden: number[] = [];
    private tracerCount = 0;
    /** aim toggled on (Option / Alt; the range's tuning panel holds it) */
    toggled = false;
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
        this.arms = new Arms(this.gl);
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
            // a scoped spec without a named scope takes the first that fits
            const sid = scopeId ?? (spec.scope ? weapon?.scopes[0] : undefined);
            const scope = sid ? await this.armory.scope(sid).catch(() => undefined) : undefined;
            const [model, scopeModel] = await Promise.all([Model.load(this.gl, `${url}${spec.model}/model.glb`), scope ? Model.load(this.gl, scope.url + scope.model) : undefined]);
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
     * the gun with their own arms (IK), others get the drawn box arms.
     */
    async setCharacter(url: string) {
        const character = await Character.load(url);
        const body = await Model.load(this.gl, character.model, { skin: character.skin });
        this.body?.destroy?.();
        this.character = character; this.body = body;
        this.attachments = new Attachments(this.gl, character);
        const skin = body.skin as unknown as SkinLike & { bones: { name: string }[] };
        const parts = character.parts;
        const chain = (side: "L" | "R") => { const p = parts[`arm.${side}`] ?? [], n = p.slice(-3); return n.length === 3 && n.every(b => skin.armature.find(b)) ? n as [string, string, string] : undefined; };
        const r = chain("R"), l = chain("L");
        this.bodyArms = r && l ? [r, l] : undefined;
        const armBones = new Set<string>();
        for (const side of ["arm.L", "arm.R"]) for (const n of parts[side] ?? []) for (const b of below(skin.armature.find(n))) armBones.add(b.name);
        const head = new Set([...(character.json.firstPerson?.hide ?? []), ...(parts.head ?? [])]);
        const index = (test: (name: string) => boolean) => skin.bones.map((b, i) => test(b.name) ? i : -1).filter(i => i >= 0);
        // the world pass: no head, no arms (the arms come with the gun, on its depth)
        this.hidden = index(n => head.has(n) || armBones.has(n) || /Thumb|Finger|MiddleHand/.test(n));
        // the gun's pass: only the arms
        this.onlyArms = this.bodyArms ? index(n => !armBones.has(n)) : [];
    }
    /** body arm chains [right, left] (upper arm, forearm, hand) */
    private bodyArms?: [[string, string, string], [string, string, string]];
    private onlyArms: number[] = [];

    /** the hand pose of a carried gun (hand editor, weapon.json `hands`) */
    handsOf(index: number): HandsFile {
        const c = this.carried[index], pose = c.arms ?? armsPoseOf(this.arms.look), h = c.hands ?? c.hold;
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
    get bodyHolds() { return !!this.bodyArms && !!this.body && this.showBody; }
    /** camera space shoulder of the body's arm (0 right, 1 left), undefined without body arms */
    shoulderOf(side: 0 | 1): Vec3 | undefined {
        const skin = this.body?.skin as unknown as SkinLike | undefined, cam = this.camera?.worldMatrix;
        if (!this.bodyHolds || !skin || !cam) return undefined;
        const b = skin.armature.find(this.bodyArms![side][0]) as unknown as { head: ArrayLike<number> } | undefined;
        if (!b) return undefined;
        const w = this.bodyMatrix().multiply(this.body!.skeletonMatrix).multiply([b.head[0], b.head[1], b.head[2], 1]) as unknown as number[];
        return point(invertRigid(mat4(), cam), [w[0], w[1], w[2]]);
    }
    get armsLook() { return this.arms.look; }
    get held() { return this.carried[this.current]; }
    get gun() { return this.held?.gun; }

    select(index: number) {
        if (!this.carried[index]) return;
        this.held?.gun.cancel();
        this.current = index;
        this.vm.set(this.carried[index].hold);
        // sounds load when a gun is first taken up (all of them at once is ~20 MB)
        void this.feel.audio.load(this.carried[index].gun.spec.model);
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
        const aiming = this.toggled || !!input?.buttons.has(2);
        const scoped = !!carried?.scope && (gun?.aimed ?? 0) > .5;
        // aimed down a scope, the mouse turns slower (by the zoom)
        const sense = (this.setting.sensitivity ?? .0022) / (scoped ? carried!.scope!.zoom * .8 : 1 + (gun?.aimed ?? 0) * .3);
        const turnYaw = -dx * sense, turnPitch = -dy * sense;
        this.yaw += turnYaw;
        this.pitch = Math.max(-LIMIT, Math.min(LIMIT, this.pitch + turnPitch));
        // the climb of recoil stays until pulled down, eases off slowly
        this.climb *= Math.exp(-dt * 1.5);

        // switching and zoom
        for (let i = 1; i <= 9; i++) if (pressed.has(String(i))) this.select(i - 1);
        if (pressed.has("[") || pressed.has("]")) this.select((this.current + (pressed.has("]") ? 1 : -1) + this.carried.length) % this.carried.length);
        if (wheel)
        {
            if (scoped) { const [lo, hi] = carried!.zoom!; carried!.scope!.zoom = Math.max(lo, Math.min(hi, carried!.scope!.zoom * (wheel < 0 ? 1.15 : 1 / 1.15))); }
            else this.select((this.current + (wheel > 0 ? 1 : -1) + this.carried.length) % this.carried.length);
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
        this.mover.update(dt, { x: (fx * ahead + rx * side) / l * v, z: (fz * ahead + rz * side) / l * v, jump: !!k(" ") });
        const m = this.mover;

        // the gun
        if (gun)
        {
            gun.aim(aiming && !sprint);
            const event = sprint ? gun.trigger(false) : gun.trigger(!!input?.buttons.has(0));
            if (event === "shot") this.fire(camera, gun);
            gun.update(dt);
            const pose = carried.model;
            pose.pose(...gunClip(pose, gun), false);
            this.spread = gun.spread(m.speed / 4.2);
        }
        const strafe = m.velocity[0] * rx + m.velocity[2] * rz;
        this.vm.update(dt, { yaw: turnYaw, pitch: turnPitch, speed: m.speed, strafe, grounded: m.grounded, landed: m.landed, aimed: gun?.aimed ?? 0, reload: gun && gun.reloading > 0 ? gun.progress : -1, sprint });

        camera.zoom = 1 + (scoped ? 0 : (gun?.aimed ?? 0) * .25);
        const out = this.lean * LEAN;
        camera.position.set([m.feet[0] + rx * out, m.feet[1] + this.eye - Math.abs(this.lean) * .06, m.feet[2] + rz * out]);
        camera.rotation.set([this.pitch + this.climb + this.vm.view[0], this.yaw + this.vm.view[1], -this.lean * LEAN_ROLL]);

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
        this.feel.cue(cue, gun, { world, muzzle: point(cam, this.vm.muzzle.from), velocity: [m.velocity[0], m.velocity[1], m.velocity[2]], eject: carried.weapon?.points?.eject });
    }

    private fire(camera: Camera, gun: Gun) {
        const cam = camera.worldMatrix, c = gun.caliber, carried = this.held, hold = carried.hold, vm = this.vm.matrix;
        const zero = carried.zero ?? gun.spec.zero;
        const muzzle = point(vm, hold.muzzle);
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
        const a = gun.aimed;
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
        this.impacts.flash(from, direction(cam, bore), gun.spec.kind === "pistol" ? .08 : c.pellets || gun.spec.caliber === "20x138b" ? .3 : .14);
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
        const clip = !m.grounded && m.airTime > .15 ? "Jump" : m.speed < .3 ? "Idle" : m.speed < 5 ? "Walking" : "Run";
        if (clip !== this.clip) { this.clip = clip; this.bodyTime = 0; }
        this.bodyTime += dt * (clip === "Walking" ? Math.max(.6, m.speed / 3.2) : clip === "Run" ? m.speed / 7 : 1);
    }

    private posed?: Float32Array;

    /** bends the body's arms onto the held gun's hands (skin space), elbows toward the arm poses */
    private reachGun(skin: SkinLike, cam: ArrayLike<number>, carried: Carried) {
        const toSkin = this.bodyMatrix().multiply(this.body!.skeletonMatrix).clone.inverse();
        const local = (p: Vec3): Vec3 => { const v = toSkin.clone.multiply([p[0], p[1], p[2], 1]) as unknown as number[]; return [v[0], v[1], v[2]]; };
        const along = (d: Vec3): Vec3 => { const a = local([0, 0, 0]), b = local(d); return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; };
        const camDir = (d: Vec3) => direction(cam, d);
        const hands = carried.hands ?? carried.hold, pose = carried.arms ?? armsPoseOf(this.arms.look), lag = this.vm.lag;
        const at = (p: Vec3) => local(point(cam, point(this.vm.matrix, p)));
        const pole = (i: 0 | 1): Vec3 => { const s = pose.shoulder[i], e = pose.elbow[i]; return along(camDir([e[0] - s[0] - lag[0], e[1] - s[1] + lag[1], e[2] - s[2]])); };
        const turn = carried.turn ?? [[0, 0], [0, 0]], r = Math.PI / 180;
        reach(skin, this.bodyArms![0], at(hands.grip), pole(0), [turn[0][0] * r, turn[0][1] * r]);
        if (hands.fore) reach(skin, this.bodyArms![1], at(hands.fore), pole(1), [turn[1][0] * r, -turn[1][1] * r]);
    }

    /** where the body is drawn: at the feet, facing the view, a little back so the eye doesn't look into it */
    private bodyMatrix() {
        const c = this.character!, s = c.json.scale ?? 1, f = this.mover.feet, y = this.yaw;
        const back = .06;
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
            this.body.pose(this.clip, this.bodyTime, this.clip !== "Jump");
            const skin = this.body.skin as unknown as SkinLike | undefined;
            if (skin && this.bodyArms && carried) this.reachGun(skin, camera.worldMatrix, carried);
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
        if (!carried) return;
        const aspect = camera.width / camera.height, scope = carried.scope;
        const fov = 2 * Math.atan(Math.tan(camera.fov / 2) / camera.zoom);
        perspective(this.near, fov, aspect, .01, 20);
        // the glass is there from the start of the raise, black; the picture comes in as the eye gets behind it
        const aimed = carried.gun.aimed, light = smoothstep(.55, .95, aimed);
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
        const hands = carried.hands ? { grip: point(this.vm.matrix, carried.hands.grip), fore: carried.hands.fore && point(this.vm.matrix, carried.hands.fore) } : this.vm.hands;
        const skin = this.body?.skin as unknown as SkinLike | undefined;
        if (this.body && this.showBody && skin && this.bodyArms && this.posed)
        {
            skin.matrices.set(this.posed);
            collapse(skin, this.onlyArms);
            this.body.draw(r, this.bodyMatrix());
        }
        else this.arms.draw(r, cam, hands, this.vm.lag, carried.arms);
        r.reset();
        if (showGlass) scope!.overlay(this.vm.matrix, this.near, aspect, showScope ? light : 0);
    }

    destroy() {
        this.input?.destroy();
        this.impacts.destroy();
        this.arms.destroy();
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
 * The held gun's clip and time: its own `reload` / `reload-empty` if it has one, else a bolt gun's `cycle` opens, holds open
 * while the rounds go in and closes; after a shot `shoot` (the jolt), then `cycle` through the `interval`.
 */
function gunClip(model: Model, gun: Gun): [string | undefined, number] {
    const has = (n: string) => !!model.animation(n), cycle = model.animation("cycle");
    const len = cycle?.duration ?? 1;
    if (gun.reloading > 0)
    {
        const own = gun.emptyReload && has("reload-empty") ? "reload-empty" : "reload";
        if (has(own)) return [own, gun.progress * (model.animation(own)!.duration)];
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
    if (has("shoot") && s < .4) return ["shoot", s];
    // rest: frame 0
    return [cycle ? "cycle" : has("shoot") ? "shoot" : undefined, 0];
}
