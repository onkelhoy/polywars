// Fighters in the camp (@polywar/aircraft on the vehicle body): fly, six .50 wing guns, vapour off the tips on hard
// pulls, engine + prop + wind sound (@polywar/vehicle-audio PlaneSound).
// Keys: Shift / Ctrl throttle, mouse or S / W pitch (S pulls), A / D roll, Z / C rudder, B brakes, I engine on / off,
// hold click fires. Wind: `planes.wind` (m/s, world), gusts `planes.gust`.
import { Matrix4 } from '@papit/matrix';
import { Aircraft, Guns } from '@polywar/aircraft';
import { Bullets } from '@polywar/ballistics';
import { PlaneSound } from '@polywar/vehicle-audio';

/** .50 M2 ball: drag per metre (≈ 870 m/s, loses a third by 1 km) */
const BULLET = { drag: .00045, life: 4 };

export function planes({ cars, player, shots, nades }) {
    const list = new Map();
    const bullets = new Bullets(shots);
    for (const c of cars)
    {
        if (c.spec.kind !== 'plane') continue;
        const air = new Aircraft(c.car, { wing: c.spec.wing, gust: 2.5 });
        const guns = new Guns(c.car, { muzzles: c.spec.guns });
        guns.onshot = s => bullets.fire({ ...s, ...BULLET });
        list.set(c, { air, guns, sound: undefined });
    }
    bullets.onhit = (b, hit) => {
        player.impacts.hit(hit.point, hit.normal, hit.surface, b.direction, hit.carrier);
        const car = hit.vehicle;
        if (car) { const v = b.velocity, k = .046; car.body.applyImpulse({ x: v[0] * k, y: v[1] * k, z: v[2] * k }); }
    };
    // the gun sound: the M2 set (double deuce), only every 3rd round played (80 rounds / s would choke the mixer)
    let soundTurn = 0;
    void player.feel.audio.load('double-deuce');
    let pitchMouse = 0, rollMouse = 0;

    return {
        list,
        bullets,
        get wind() { return [...list.values()][0]?.air.wind; },
        set gust(g) { for (const p of list.values()) p.air.s.gust = g; },
        of: c => list.get(c),
        /** the mouse steers the stick (pitch / roll), eased back to centre */
        mouse(dx, dy) { rollMouse = Math.max(-1, Math.min(1, rollMouse + dx * .004)); pitchMouse = Math.max(-1, Math.min(1, pitchMouse - dy * .004)); },
        /** before the vehicles step: controls in, wheel input out (`inputs`) */
        control(dt, driving, input, inputs) {
            for (const [c, p] of list)
            {
                const flying = c === driving, k = n => (flying && input?.key(n)) ? 1 : 0, ctl = p.air.controls;
                if (flying)
                {
                    ctl.throttle = Math.max(0, Math.min(1, ctl.throttle + (k('shift') - k('control')) * dt * .6));
                    pitchMouse *= Math.exp(-dt * 1.5); rollMouse *= Math.exp(-dt * 1.5);
                    ctl.pitch = Math.max(-1, Math.min(1, pitchMouse + k('s') - k('w')));
                    ctl.roll = Math.max(-1, Math.min(1, rollMouse + k('d') - k('a')));
                    ctl.yaw = k('c') - k('z');
                    ctl.brake = !!input?.key('b');
                }
                else { ctl.pitch = ctl.roll = ctl.yaw = 0; p.guns.trigger = false; }
                inputs.set(c.car, p.air.drive(flying));
            }
        },
        /** after the step: guns, sound, vapour */
        update(dt, driving) {
            for (const [c, p] of list)
            {
                p.guns.update(dt);
                for (let i = 0; i < p.guns.fired.length; i++)
                    if (p.guns.fired[i] && (soundTurn++ % 3 === 0)) player.feel.audio.shot('double-deuce', c.car.toWorld(c.spec.guns[i]), { volume: 1.2 });
                if (p.air.running && !p.sound) p.sound = new PlaneSound(player.feel.mixer);
                if (!p.air.running && p.sound) { p.sound.stop(); p.sound = undefined; }
                const pos = c.car.body.position;
                p.sound?.update({ rpm: p.air.rpm, load: p.air.power, airspeed: p.air.airspeed, position: [pos.x, pos.y, pos.z] });
                // wing tip vapour: thin white puffs left in the air, a line behind each tip
                if (p.air.vapour > 0)
                    for (const tip of c.spec.wing.tips)
                    {
                        const at = c.car.toWorld(tip);
                        nades.smoke.burst({ layers: [{ count: 2, shape: 'sphere', radius: .05, direction: [0, 1, 0], spread: 1, speed: [0, .2], life: [.5 + p.air.vapour, 1 + p.air.vapour * 1.5], size: [.25, .45], grow: 1.5, drag: 3, lift: 0, swirl: .2, stretch: 0, colour: [.97, .97, 1], bright: 1, dim: .9 }] }, [at[0], at[1], at[2]], { opacity: .35 + .5 * p.air.vapour });
                    }
            }
            bullets.update(dt);
            if (driving && list.has(driving)) player.impacts.tracers(bullets.list.filter(b => b.tracer));
        },
        fire(c, on) {
            const p = list.get(c);
            if (!p) return;
            p.guns.trigger = on && p.guns.total > 0;
        },
        /** propeller + wheels onto a plane's model */
        pose(c, model) {
            const p = list.get(c);
            if (!p) return;
            const pr = c.spec.propeller, a = p.air.propeller, cs = Math.cos(a), sn = Math.sin(a), [x, y, z] = pr.position;
            // round the nose axis (z) through the hub
            model.move(pr.node, Matrix4.create([cs, sn, 0, 0, -sn, cs, 0, 0, 0, 0, 1, 0, x - (cs * x - sn * y), y - (sn * x + cs * y), 0, 1]));
        },
        /** a plane's HUD line */
        hud(c) {
            const p = list.get(c), a = p.air, h = c.car.body.position.y;
            return `${(a.airspeed * 3.6).toFixed(0)} km/h · ${h.toFixed(0)} m · thr ${(a.controls.throttle * 100).toFixed(0)}% · ${a.g.toFixed(1)} g${a.stalled ? ' · STALL' : ''} · ammo ${p.guns.total}`;
        },
    };
}
