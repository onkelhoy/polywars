// The tank's gun in the camp: the turret follows the look (slow), left click fires a ~7 kg AP shell (@polywar/ballistics).
// The shot: barrel runs back, the hull rocks, a muzzle blast (@polywar/explosion: flash, smoke, shock) and dust thrown up
// all round. The crew inside only gets a dulled shock (grenades.js `armour`). A hit doesn't explode, but the force
// shatters what it hits: a small blast of chunks + dust at the impact, cars hit get shoved.
import { MeshBuilder, upload } from '@papit/game-mesh';
import { Matrix4 } from '@papit/matrix';
import { Bullets } from '@polywar/ballistics';
import { Turret } from '@polywar/vehicle';

/** a WW2 75 mm gun: shell kg, m/s, drag per metre, reload s; blast kg TNT at the muzzle / the hit */
export const GUN = { shell: 6.8, speed: 790, drag: .00012, reload: 6, muzzle: 1.2, impact: 2.5, recoil: 3 };

export function tankGun({ gl, renderer, nades, shots, dust }) {
    const turrets = new Map();
    const bullets = new Bullets(shots);
    const tracer = upload(gl, new MeshBuilder().box('#ffd27a', { at: [0, 0, 0], scale: [.12, .12, .12] }).build());
    let loading = 0;

    bullets.onhit = (b, hit) => {
        // AP: no charge, but the hit packs ~2 MJ: chunks + dust burst out like a blast
        nades.explosion.explode(hit.point, { power: GUN.impact, tag: 'tank' });
        const car = hit.vehicle;
        if (car)
        {
            const v = b.velocity, s = GUN.shell * .9;
            car.body.applyImpulse({ x: v[0] * s, y: v[1] * s, z: v[2] * s });
            const w = car.body.angularVelocity;
            w.x += (Math.random() - .5) * .4; w.y += (Math.random() - .5) * .6; w.z += (Math.random() - .5) * .4;
        }
    };

    const turretOf = c => {
        if (!c.spec.turret) return undefined;
        let t = turrets.get(c);
        if (!t) turrets.set(c, t = new Turret(c.car, { elevate: 9, traverse: 20 }));
        return t;
    };

    return {
        turretOf,
        get loading() { return loading; },
        /** aim the driven tank's turret along `look` (world), age the shots */
        update(dt, driven, look) {
            loading = Math.max(0, loading - dt);
            const t = driven && turretOf(driven);
            if (t && look) t.aim(look, dt);
            for (const t of turrets.values()) t.update(dt);
            bullets.update(dt);
        },
        fire(c) {
            const t = turretOf(c);
            if (!t || loading > 0) return false;
            loading = GUN.reload;
            const from = t.muzzle(), dir = t.direction();
            bullets.fire({ from: [from[0], from[1], from[2]], direction: [dir[0], dir[1], dir[2]], speed: GUN.speed, drag: GUN.drag, life: 8 });
            t.fire();
            // recoil: the shell's momentum plus the gases (x GUN.recoil), through the trunnion: the hull rocks back
            const k = GUN.shell * GUN.speed * GUN.recoil, g = c.spec.gun.position;
            c.car.kick(g, [-dir[0] * k, -dir[1] * k, -dir[2] * k], .05);
            // muzzle blast just in front of the barrel (flash, smoke, shock wave, sound)
            const at = [from[0] + dir[0] * .6, from[1] + dir[1] * .6, from[2] + dir[2] * .6];
            nades.explosion.explode(at, { power: GUN.muzzle, mark: false, tag: 'tank' });
            // the crew feels every shot: a slight shock (blur + dulled ears)
            nades.daze.hit(.18); nades.audio.stun(.12);
            // the blast hits the ground round the tank: a ring of dust thrown out, heaviest under the muzzle
            const p = c.car.body.position;
            for (let i = 0; i < 14; i++)
            {
                const a = i / 14 * Math.PI * 2, r = 3 + Math.random();
                const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
                const out = 4 + Math.random() * 3;
                dust([x, 0, z], [Math.cos(a) * out, .8 + Math.random(), Math.sin(a) * out]);
            }
            for (let i = 0; i < 8; i++)
            {
                const d = 2 + i * 1.2, x = from[0] + dir[0] * d, z = from[2] + dir[2] * d;
                dust([x, 0, z], [dir[0] * 8 + (Math.random() - .5) * 4, 1 + Math.random(), dir[2] * 8 + (Math.random() - .5) * 4]);
            }
            return true;
        },
        /** turret + barrel node moves onto a tank model */
        pose(c, model) {
            const t = turretOf(c);
            if (!t) return;
            model.move(c.spec.turret.node, t.turretMatrix(Matrix4.create()));
            model.move(c.spec.gun.node, t.gunMatrix(Matrix4.create()));
        },
        draw() {
            for (const b of bullets.list)
            {
                const p = b.position;
                renderer.draw(tracer, Matrix4.create([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1]));
            }
        },
    };
}
