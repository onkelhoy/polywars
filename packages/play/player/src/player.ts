import type { Camera, CameraController, Layer3D } from "@papit/game-engine";
import { upload, type GPUMesh } from "@papit/game-mesh";
import { Matrix4 } from "@papit/matrix";
import { Bullets, zeroAngle } from "@polywar/ballistics";
import { Attachments, Character } from "@polywar/characters";
import { Impacts } from "@polywar/impacts";
import { Mover } from "@polywar/mover";
import { Model, type Renderer } from "@polywar/renderer";
import { direction, mat4, perspective, point, Scope, ViewModel, type Hold, type Vec3 } from "@polywar/viewmodel";
import { Gun, GUNS } from "@polywar/weapons";
import { Arms } from "./arms";
import { holdOf, scopeMountOf } from "./holds";
import { Input } from "./input";
import type { PlayerEvents, PlayerSetting } from "./types";

type Carried = { gun: Gun; model: Model; hold: Hold; scope?: Scope; scopeMesh?: GPUMesh };

const LIMIT = Math.PI / 2 - .02;

/**
 * A playable character in first person: walks on the host's ground (`@polywar/mover`), looks with the mouse,
 * carries guns (`@polywar/weapons`) held by a `ViewModel` with arms, fires real bullets (`@polywar/ballistics`)
 * that leave tracers, bits and marks (`@polywar/impacts`), a scope with its own picture for scoped guns.
 * Its body (a `character.json`) is drawn under the view, head and arms left out.
 *
 * Keys: WASD walk, shift run, space jump, left mouse fire, right mouse aim, R reload, 1..9 / wheel switch guns
 * (wheel zooms a scope while aimed), Esc lets go of the mouse.
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
        this.ready = this.load();
    }

    private async load() {
        const url = this.setting.gunsUrl ?? "/assets/models/weapons/guns/";
        const ids = this.setting.guns ?? Object.keys(GUNS);
        const models = await Promise.all(ids.map(id => Model.load(this.gl, `${url}${GUNS[id].model}/model.glb`)));
        ids.forEach((id, i) => {
            const gun = new Gun(id), model = models[i];
            let hold = holdOf(model, gun.spec), scope: Scope | undefined, scopeMesh: GPUMesh | undefined;
            if (gun.spec.scope)
            {
                scope = new Scope(this.layer, scopeMountOf(model));
                scope.zoom = Math.sqrt(gun.spec.scope.min * gun.spec.scope.max);
                scopeMesh = upload(this.gl, scope.mesh());
                hold = scope.hold(hold, Math.PI / 3);
            }
            this.carried.push({ gun, model, hold, scope, scopeMesh });
        });
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

    update(camera: Camera, dt: number) {
        const input = this.input, carried = this.held;
        const { dx, dy, wheel, pressed } = input?.consume() ?? { dx: 0, dy: 0, wheel: 0, pressed: new Set<string>() };
        const k = (...n: string[]) => input?.key(...n) ? 1 : 0;
        const gun = carried?.gun;
        const aiming = !!input?.buttons.has(2);
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
            if (scoped) { const s = gun!.spec.scope!; carried!.scope!.zoom = Math.max(s.min, Math.min(s.max, carried!.scope!.zoom * (wheel < 0 ? 1.15 : 1 / 1.15))); }
            else this.select((this.current + (wheel > 0 ? 1 : -1) + this.carried.length) % this.carried.length);
        }
        if (pressed.has("r")) gun?.reload();

        // walking
        const ahead = k("w", "arrowup") - k("s", "arrowdown"), side = k("d", "arrowright") - k("a", "arrowleft");
        const sprint = !!k("shift") && ahead > 0 && !aiming;
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
        camera.position.set([m.feet[0], m.feet[1] + this.eye, m.feet[2]]);
        camera.rotation.set([this.pitch + this.climb + this.vm.view[0], this.yaw + this.vm.view[1], 0]);

        this.bullets.update(dt);
        this.impacts.update(dt);
        this.impacts.tracers(this.bullets.list.filter(b => b.tracer));
        this.animateBody(dt);
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
        this.impacts.draw(camera);
        r.reset();
        if (!carried) return;
        const aspect = camera.width / camera.height, scope = carried.scope;
        const fov = 2 * Math.atan(Math.tan(camera.fov / 2) / camera.zoom);
        perspective(this.near, fov, aspect, .01, 20);
        const showScope = scope && carried.gun.aimed > scope.threshold && this.setting.scene;
        if (showScope)
        {
            const view = scope.begin(camera.worldMatrix, this.vm.matrix, this.near, .1, camera.far);
            r.begin(view, [.6, .7, .8, 1]);
            this.setting.scene!(view);
            this.impacts.draw(view);
            scope.end();
            r.reset();
        }
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const cam = camera.worldMatrix;
        r.begin({ viewMatrix: camera.viewMatrix, projectionMatrix: this.near, worldPosition: camera.worldPosition }, null);
        const world = Matrix4.create(Array.from(this.vm.world(cam)));
        carried.model.draw(r, world);
        if (carried.scopeMesh) r.draw(carried.scopeMesh, world);
        this.arms.draw(r, cam, this.vm.hands);
        r.reset();
        if (showScope) scope.overlay(this.vm.matrix, this.near, aspect);
    }

    destroy() {
        this.input?.destroy();
        this.impacts.destroy();
        this.arms.destroy();
        for (const c of this.carried) { c.model.destroy(); c.scope?.destroy(); c.scopeMesh?.destroy(); }
        this.body?.destroy();
    }
}
