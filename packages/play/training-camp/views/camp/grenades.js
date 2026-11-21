// Grenades in the camp: hold G to wind up (arc shown), let go to throw; 4 s fuse, then @polywar/explosion.
// A pit east of the spawn: sandbag ring, crates and dummies (their own rigidbody world) to blow around.
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { World, RigidBody, Box } from '@papit/rigidbody';
import { Smoke } from '@polywar/smoke';
import { Explosion, ShockFront, shellShock, BlastForce, ExplosionAudio, Daze, Knockdown, bodyTargets, worldCover } from '@polywar/explosion';
import { Grenade, GRENADES } from '@polywar/weapons';

export const PIT = [25, 38];

export async function grenades({ layer, gl, renderer, range, player, playing, busy }) {
    const smoke = new Smoke(layer, { puffs: 6000 });
    const explosion = new Explosion(layer, { smoke, ground: range.ground });
    const daze = new Daze(layer), knock = new Knockdown({ eye: 1.7 });
    knock.onblink = () => daze.clear(.3);
    const audio = new ExplosionAudio({ mixer: player.feel.mixer, cast: (a, b) => range.cast(a, b), deaf: () => player.deaf });
    audio.load();

    // ---- the pit: own world (static ground slab + sandbags, crates 20 kg, dummies 80 kg) ----
    const world = new World(), things = [];
    const gy = range.ground(PIT[0], PIT[1]);
    world.add(new RigidBody({ shape: new Box(60, 1, 60), position: { x: PIT[0], y: gy - .5, z: PIT[1] } }));
    const meshes = {};
    const meshOf = (size, colour) => meshes[size + colour] ??= upload(gl, new MeshBuilder().box(colour, { at: [0, 0, 0], scale: size }).build());
    const add = (size, mass, at, colour) => {
        const body = world.add(new RigidBody({ shape: new Box(...size), mass, position: { x: at[0], y: gy + size[1] / 2 + (at[1] ?? 0), z: at[2] }, friction: .7, restitution: .1 }));
        things.push({ body, mesh: meshOf(size, colour), matrix: new Float32Array(16) });
    };
    const sandbags = [];
    for (let i = 0; i < 16; i++)
    {
        const a = i / 16 * Math.PI * 2, r = 9;
        if (i === 12) continue; // a gap facing the spawn
        const at = [PIT[0] + Math.cos(a) * r, 0, PIT[1] + Math.sin(a) * r];
        add([3.4, .9, .7], 0, at, '#b8a478');
        sandbags.push(things[things.length - 1]);
    }
    const reset = () => {
        for (const t of things.splice(sandbags.length)) world.remove?.(t.body);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3, r = 2.5 + (i % 2) * 2.5; add([.8, .8, .8], 20, [PIT[0] + Math.cos(a) * r, 0, PIT[1] + Math.sin(a) * r], '#a07a4a'); }
        for (const [dx, dz] of [[-4, -3], [3, 4], [0, -6]]) add([.5, 1.8, .3], 80, [PIT[0] + dx, 0, PIT[1] + dz], '#b03a3a');
        for (let i = 0; i < 60; i++) world.update(1 / 60);
    };
    reset();
    // the pit's walls stop grenades too
    const pitBoxes = sandbags.map(t => { const p = t.body.position; return { min: [p.x - 1.7, p.y - .45, p.z - .35], max: [p.x + 1.7, p.y + .45, p.z + .35] }; });

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

    // ---- the grenades ----
    const spec = GRENADES.frag;
    const gMesh = upload(gl, new MeshBuilder()
        .sphere(spec.colour, { scale: [spec.radius * 2, spec.radius * 2.4, spec.radius * 2] }, 1)
        .cylinder(spec.band, { at: [0, spec.radius * 1.2, 0], scale: [spec.radius, spec.radius * .8, spec.radius] }, 6)
        .build());
    const dot = upload(gl, new MeshBuilder().box('#ffffff', { scale: [.05, .05, .05] }).build());
    const colliders = (x, z) => [...range.colliders(x, z), ...pitBoxes];
    const live = [];
    const setting = { ground: range.ground, colliders, onexplode: at => explosion.explode(at, { power: spec.power }) };
    let holding = -1, held;
    const hand = () => {
        const w = layer.camera.worldMatrix, e = [w[12], w[13], w[14]], f = [-w[8], -w[9], -w[10]], r = [w[0], w[1], w[2]];
        const from = [e[0] + f[0] * .4 + r[0] * .25, e[1] - .15, e[2] + f[2] * .4 + r[2] * .25];
        // a little up from the look: a natural lob
        return { from, dir: [f[0], f[1] + .25, f[2]] };
    };
    addEventListener('keydown', e => {
        if (e.repeat || e.key.toLowerCase() !== 'g' || !playing() || busy() || knock.active) return;
        if (e.key === 'G' || e.shiftKey) { reset(); return; } // Shift+G: new crates / dummies
        held = new Grenade(spec, setting);
        held.pull();
        holding = 0;
    });
    addEventListener('keyup', e => {
        if (e.key.toLowerCase() !== 'g' || !held) return;
        const { from, dir } = hand(), m = player.mover;
        held.throw(from, dir, holding, m.velocity ?? [0, 0, 0]);
        live.push(held);
        held = undefined; holding = -1;
    });

    const matrix = new Float32Array(16);
    let arc = [];
    return {
        held: () => !!held,
        prompt: () => held ? `G  throw · fuse ${held.left.toFixed(1)} s` : '',
        tick(dt) {
            if (held)
            {
                holding += dt;
                held.update(dt);
                if (held.state === 'gone') held = undefined; // cooked off in the hand
                else { const { from, dir } = hand(); arc = Grenade.arc(spec, setting, from, dir, holding); }
            }
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
        /** opaque: grenades, pit, arc */
        draw() {
            for (const t of things) renderer.draw(t.mesh, t.body.matrix(t.matrix));
            for (const g of live) renderer.draw(gMesh, g.matrix(matrix));
            for (let i = 2; i < arc.length; i += 2) { const p = arc[i]; renderer.draw(dot, Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1])); }
        },
        /** after everything opaque */
        drawAir(camera) { smoke.draw(camera); explosion.draw(camera); },
        drawDaze() { daze.draw(); },
        lights: () => explosion.lights,
    };
}
