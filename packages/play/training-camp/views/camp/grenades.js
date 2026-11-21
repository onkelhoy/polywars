// Grenades in the camp: hold G to wind up (arc shown), let go to throw; 4 s fuse, then @polywar/explosion.
// A pit east of the spawn: sandbag ring, crates and dummies (their own rigidbody world) to blow around.
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { World, RigidBody, Box } from '@papit/rigidbody';
import { Smoke } from '@polywar/smoke';
import { Explosion, ShockFront, shellShock, BlastForce, ExplosionAudio, Daze, Knockdown, bodyTargets, worldCover } from '@polywar/explosion';
import { Grenade, GRENADES } from '@polywar/weapons';
import { Model } from '@polywar/renderer';

export const PIT = [25, 38];

export async function grenades({ layer, gl, renderer, range, player, playing, busy }) {
    const smoke = new Smoke(layer, { puffs: 6000 });
    const explosion = new Explosion(layer, { smoke, ground: range.ground });
    const daze = new Daze(layer), knock = new Knockdown({ eye: 1.7 });
    knock.onblink = () => daze.clear(.3);
    const audio = new ExplosionAudio({ mixer: player.feel.mixer, cast: (a, b) => range.cast(a, b), deaf: () => player.deaf });
    audio.load();

    // ---- grenade crates (own world for anything the blast pushes; host props can join it later) ----
    const world = new World(), things = [];
    const gy = range.ground(PIT[0], PIT[1]);
    world.add(new RigidBody({ shape: new Box(60, 1, 60), position: { x: PIT[0], y: gy - .5, z: PIT[1] } }));
    const meshes = {};
    const meshOf = (size, colour) => meshes[size + colour] ??= upload(gl, new MeshBuilder().box(colour, { at: [0, 0, 0], scale: size }).build());
    const add = (size, mass, at, colour) => {
        const body = world.add(new RigidBody({ shape: new Box(...size), mass, position: { x: at[0], y: gy + size[1] / 2 + (at[1] ?? 0), z: at[2] }, friction: .7, restitution: .1 }));
        things.push({ body, mesh: meshOf(size, colour), matrix: new Float32Array(16) });
    };
    const reset = () => { };

    // ---- you as a target: pushed, dazed, deafened, knocked down ----
    const target = player.blastTarget;
    const you = {
        get position() { return target.position; }, mass: 80, size: .45, lift: .25, cap: 6,
        push(v, spin, hit) {
            target.push(v, spin, hit);
            const a = shellShock(hit.pressure);
            daze.hit(a); audio.stun(a);
            const r = layer.camera.rotation, k = Math.max(a, Math.min(1, hit.over / 6));
            knock.hit(k, hit.direction, r.y, r.x);
            if (k > .5) player.knockGun(hit.direction, k);
        },
    };
    player.setting.pose = () => knock.active ? knock : undefined;
    const force = new BlastForce({ targets: () => [...bodyTargets(world), you], cover: worldCover(world), front: p => new ShockFront(p) });
    explosion.onexplode = b => { force.blast(b.position, b.power); audio.play(b.position, b.power); };

    // ---- the grenades: the owner's models (assets/models/weapons/grenades/<model>/model.glb), long axis y, centred ----
    const models = {};
    for (const [k, sp] of Object.entries(GRENADES)) if (sp.model) models[k] = await Model.load(gl, `/assets/models/weapons/grenades/${sp.model}/model.glb`).catch(() => undefined);
    // the model's centre on the grenade's point (the stick turns round its middle)
    const placed = (kind, m) => { const md = models[kind], c = md?.center ?? [0, 0, 0]; const M = Matrix4.create(Array.from(m)); return M.multiply(Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -c[0], -c[1], -c[2], 1])); };
    const dot = upload(gl, new MeshBuilder().box('#ffffff', { scale: [.05, .05, .05] }).build());
    const colliders = (x, z) => range.colliders(x, z);
    const live = [];
    const setting = { ground: range.ground, colliders, onexplode: (at, power) => explosion.explode(at, { power }) };
    // crates: one kind each (later: the owner's boxes). F takes some: one comes straight into the hand.
    // In hand: the gun (if any) in the off hand, the grenade in front. Hold fire = pin out + wind up (arc), let go = throw
    // (the fuse starts), the hand back on the gun. H: the next one into the hand / put it back. Right click while winding = pin back.
    const crates = [
        { at: [PIT[0] - 9, PIT[1] + 2], kind: 'mk2', take: 4 },
        { at: [PIT[0] - 9, PIT[1] + 4], kind: 'f1', take: 4 },
        { at: [PIT[0] - 9, PIT[1] + 6], kind: 'stick', take: 4 },
    ];
    for (const c of crates) add([1, .5, .6], 0, [c.at[0], 0, c.at[1]], '#5a4a32');
    const bag = {};
    let kind = 'mk2', spec = GRENADES.mk2, inHand = false, holding = -1, weight = 0;
    const nearCrate = () => { const f = player.mover.feet; return crates.find(c => Math.hypot(f[0] - c.at[0], f[2] - c.at[1]) < 1.5); };
    const have = () => Object.keys(bag).filter(k => bag[k] > 0);
    const take = k => { kind = k; spec = GRENADES[k]; inHand = true; holding = -1; };
    const hand = () => {
        const w = layer.camera.worldMatrix, e = [w[12], w[13], w[14]], f = [-w[8], -w[9], -w[10]], r = [w[0], w[1], w[2]];
        const from = [e[0] + f[0] * .4 + r[0] * .25, e[1] - .15, e[2] + f[2] * .4 + r[2] * .25];
        // a little up from the look: a natural lob
        return { from, dir: [f[0], f[1] + .25, f[2]] };
    };
    // camera space: in front, low right; wound back over the shoulder while holding fire
    const spot = () => { const back = Math.min(1, Math.max(0, holding) / spec.wind); return [.16 + back * .1, -.16 + back * .2, -.36 + back * .26]; };
    addEventListener('keydown', e => {
        if (e.repeat || !playing() || busy()) return;
        const k = e.key.toLowerCase(), c = k === 'f' && nearCrate();
        if (c) { bag[c.kind] = c.take; if (!knock.active) take(c.kind); return; }
        if (k !== 'h' || knock.active || holding >= 0) return;
        // H: through the kinds you have, then hands back on the gun
        const kinds = have(), i = inHand ? kinds.indexOf(kind) + 1 : 0;
        if (i < kinds.length) take(kinds[i]); else inHand = false;
    });
    addEventListener('mousedown', e => {
        if (!inHand || !playing() || knock.active) return;
        if (e.button === 0 && holding < 0) holding = 0;
        if (e.button === 2 && holding >= 0) holding = -1;
    });
    addEventListener('mouseup', e => {
        if (e.button !== 0 || !inHand || holding < 0) return;
        const g = new Grenade(spec, setting), { from, dir } = hand();
        g.throw(from, dir, holding, player.mover.velocity);
        g.kind = kind;
        live.push(g);
        bag[kind]--;
        // thrown: the hand goes back to the gun
        holding = -1; inHand = false;
    });

    const matrix = new Float32Array(16);
    let arc = [];
    return {
        held: () => inHand || !!nearCrate(),
        prompt: () => inHand ? (holding >= 0 ? `let go to throw · ${Math.round(new Grenade(spec, setting).speedOf(holding))} m/s · right click: pin back` : `hold fire to throw · H next / gun`) + ` · ${spec.name} ${bag[kind]}` : `F  take ${GRENADES[nearCrate().kind].name} grenades`,
        tick(dt) {
            // knocked down: it drops from the hand (pin still in)
            if (knock.active) { inHand = false; holding = -1; }
            // the gun to the off hand while a grenade is in hand: in .25 s, back .4 s after the throw
            weight = inHand ? Math.min(1, weight + dt / .25) : Math.max(0, weight - dt / .4);
            if (holding >= 0) holding += dt;
            player.busyHand = weight > 0 ? { weight, at: spot() } : undefined;
            if (holding >= 0) { const { from, dir } = hand(); arc = Grenade.arc(spec, setting, from, dir, holding); }
            else arc = [];
            for (const g of live) g.update(dt);
            for (let i = live.length - 1; i >= 0; i--) if (live[i].state === 'gone') live.splice(i, 1);
            explosion.update(dt); smoke.update(dt); force.update(dt); world.update(dt);
            knock.update(dt, layer.camera ? layer.camera.rotation.x - knock.pitch : 0);
            daze.blink = knock.blink;
            daze.update(dt);
            const c = layer.camera;
            if (c?.worldMatrix) { const w = c.worldMatrix, e = [w[12], w[13], w[14]]; audio.setListener(e, [-w[8], -w[9], -w[10]]); audio.ring(player.deaf); }
        },
        glare: () => { const w = layer.camera?.worldMatrix; return w ? explosion.glare([w[12], w[13], w[14]]) : 0; },
        /** opaque: grenades, crates, arc */
        draw() {
            for (const t of things) renderer.draw(t.mesh, t.body.matrix(t.matrix));
            for (const c of crates) models[c.kind]?.draw(renderer, placed(c.kind, Matrix4.create([0, 0, -1, 0, 1, 0, 0, 0, 0, 1, 0, 0, c.at[0], range.ground(c.at[0], c.at[1]) + .55, c.at[1], 1])));
            for (const g of live) models[g.kind]?.draw(renderer, placed(g.kind, g.matrix(matrix)));
            if (inHand && weight > .5 && layer.camera?.worldMatrix)
            {
                const w = layer.camera.worldMatrix, o = spot(), m = new Float32Array(w);
                for (let k = 0; k < 3; k++) m[12 + k] = w[12 + k] + w[k] * o[0] + w[4 + k] * o[1] + w[8 + k] * o[2];
                models[kind]?.draw(renderer, placed(kind, m));
            }
            for (let i = 2; i < arc.length; i += 2) { const p = arc[i]; renderer.draw(dot, Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1])); }
        },
        /** after everything opaque */
        drawAir(camera) { smoke.draw(camera); explosion.draw(camera); },
        drawDaze() { daze.draw(); },
        lights: () => explosion.lights,
    };
}
