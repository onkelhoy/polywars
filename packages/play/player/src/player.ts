import type { Camera, CameraController, Layer3D } from "@papit/game-engine";
import { upload, type GPUMesh } from "@papit/game-mesh";
import { Matrix4 } from "@papit/matrix";
import { Bullets, zeroAngle } from "@polywar/ballistics";
import { Attachments, Character } from "@polywar/characters";
import { Impacts } from "@polywar/impacts";
import { Mover } from "@polywar/mover";
import { Model, type Renderer } from "@polywar/renderer";
import { direction, mat4, perspective, point, Scope, ViewModel, type Hold, type Vec3 } from "@polywar/viewmodel";
import { Gun, GUNS, type Cue } from "@polywar/weapons";
import { Armory, type WeaponFile } from "@polywar/armory";
import { Arms } from "./arms";
import { Feel } from "./feel";
import { holdOf, scopeMountFor, scopeMountOf } from "./holds";
import { Input } from "./input";
import type { PlayerEvents, PlayerSetting } from "./types";

/** `scopeModel` (a scope from the armory) is drawn `scopeAt` off the gun; `scopeMesh` is the stand-in without one */
type Carried = { gun: Gun; model: Model; hold: Hold; weapon?: WeaponFile; scope?: Scope; zoom?: [number, number]; scopeModel?: Model; scopeAt?: Matrix4; scopeMesh?: GPUMesh };

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
    /** aim toggled on (Option / Alt) */
    private toggled = false;
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
            return { id, weapon, scope, model, scopeModel };
        }));
        for (const { id, weapon, scope: data, model, scopeModel } of loaded)
        {
            const gun = new Gun(id, Infinity, weapon?.action);
            gun.oncue = (cue, g) => this.cue(cue, g);
            void this.feel.load(this.gl, gun);
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
            this.carried.push({ gun, model, hold, weapon, scope, zoom, scopeModel, scopeAt, scopeMesh });
        }
        this.select(0);
        if (this.setting.character)
        {
            this.character = await Character.load(this.setting.character);
            this.body = await Model.load(this.gl, this.character.model, { skin: this.character.skin });
            this.attachments = new Attachments(this.gl, this.character);
            const skin = this.body.skin as unknown as { bones?: { name: string }[] } | undefined;
            const hide = this.character.json.firstPerson?.hide ?? [];
            // the head and the arms (first person arms are drawn on their own)
            const parts = this.character.parts;
            const names = new Set([...hide, ...(parts["arm.L"] ?? []), ...(parts["arm.R"] ?? []), ...(parts.head ?? [])]);
            this.hidden = (skin?.bones ?? []).map((b, i) => names.has(b.name) || /Thumb|Finger|MiddleHand/.test(b.name) ? i : -1).filter(i => i >= 0);
        }
    }

    get held() { return this.carried[this.current]; }
    get gun() { return this.held?.gun; }

    select(index: number) {
        if (!this.carried[index]) return;
        this.held?.gun.cancel();
        this.current = index;
        this.vm.set(this.carried[index].hold);
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
            if (gun.reloading > 0) pose.pose(gun.emptyReload ? "reload-empty" : "reload", gun.progress * 2, false);
            else if (gun.sinceShot < .25) pose.pose("fire", gun.sinceShot, false);
            else pose.pose("idle", 0);
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
        this.feel.cue(cue, gun, { world, muzzle: point(cam, this.vm.muzzle.from), velocity: [m.velocity[0], m.velocity[1], m.velocity[2]], eject: carried.weapon?.points.eject });
    }

    private fire(camera: Camera, gun: Gun) {
        const cam = camera.worldMatrix, c = gun.caliber, hold = this.held.hold;
        const muzzle = this.vm.muzzle;
        const from = point(cam, muzzle.from);
        let d = direction(cam, muzzle.direction);
        const up = direction(cam, [0, 1, 0]), right = direction(cam, [1, 0, 0]);
        // the sights sit over the bore: tipped up so they meet at the zero
        const zero = zeroAngle(c.speed, c.drag, gun.spec.zero, Math.max(0, hold.sight[1] - hold.muzzle[1]));
        const [sx, sy] = gun.scatter(this.mover.speed / 4.2);
        d = [d[0] + up[0] * (zero + sy) + right[0] * sx, d[1] + up[1] * (zero + sy) + right[1] * sx, d[2] + up[2] * (zero + sy) + right[2] * sx];
        const l = Math.hypot(...d);
        d = [d[0] / l, d[1] / l, d[2] / l];
        // a tracer every round for single shots, every third for automatics
        const tracer = !gun.spec.auto || this.tracerCount++ % 3 === 0;
        this.bullets.fire({ from, direction: d, speed: c.speed, drag: c.drag, life: c.life, tracer, data: { gun: gun.spec.model } });
        this.impacts.flash(from, d, gun.spec.kind === "pistol" ? .08 : .14);
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
            // hidden bones shrink onto their own joint (the neck, the shoulders): no spikes from shared vertices
            const skin = this.body.skin as unknown as { matrices: Float32Array; bones: { head: ArrayLike<number> }[] } | undefined;
            if (skin) for (const i of this.hidden)
            {
                const h = skin.bones[i].head;
                skin.matrices.fill(0, i * 16, i * 16 + 16);
                skin.matrices[i * 16 + 12] = h[0]; skin.matrices[i * 16 + 13] = h[1]; skin.matrices[i * 16 + 14] = h[2]; skin.matrices[i * 16 + 15] = 1;
            }
            this.body.draw(r, this.bodyMatrix());
        }
        this.feel.draw(r);
        this.impacts.draw(camera);
        r.reset();
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
        this.arms.draw(r, cam, this.vm.hands);
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

function smoothstep(a: number, b: number, x: number) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
