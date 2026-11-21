// Fighters in the camp (@polywar/aircraft on the vehicle body): fly, six .50 wing guns, vapour off the tips on hard
// pulls, engine + prop + wind sound (@polywar/vehicle-audio PlaneSound).
// Keys: ground: W forward, S brake / back up, A / D steer. Air: W / S throttle up / down, the mouse points where to
// fly (the plane flies there itself: `instruct`), A / D roll by hand. Flaps by speed. I engine, hold click fires. Wind: `planes.wind` (m/s, world), gusts `planes.gust`.
import { Matrix4 } from '@papit/matrix';
import { Aircraft, Guns, instruct } from '@polywar/aircraft';
import { Bullets } from '@polywar/ballistics';
import { PlaneSound } from '@polywar/vehicle-audio';

/** .50 M2 ball: drag per metre (≈ 870 m/s, loses a third by 1 km) */
const BULLET = { drag: .00045, life: 4 };

export function planes({ cars, player, shots, nades, range }) {
    const list = new Map();
    const bullets = new Bullets(shots);
    for (const c of cars)
    {
        if (c.spec.kind !== 'plane') continue;
        const air = new Aircraft(c.car, { wing: c.spec.wing, gust: 1 });
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
    /** the mouse aim: world yaw / pitch (where the plane should fly) */
    const aim = { yaw: 0, pitch: 0 };

    return {
        list,
        bullets,
        get wind() { return [...list.values()][0]?.air.wind; },
        set gust(g) { for (const p of list.values()) p.air.s.gust = g; },
        of: c => list.get(c),
        aim,
        /** aim along the plane's nose (on getting in) */
        reset(c) { const f = c.car.toWorld([0, 0, -1], undefined, 0); aim.yaw = Math.atan2(-f[0], -f[2]); aim.pitch = Math.asin(Math.max(-1, Math.min(1, f[1]))); },
        /** the mouse moves the aim */
        mouse(dx, dy) { aim.yaw -= dx * .0022; aim.pitch = Math.max(-1.45, Math.min(1.45, aim.pitch - dy * .0022)); },
        /** the aim as a world direction */
        aimDir() { const cp = Math.cos(aim.pitch); return [-Math.sin(aim.yaw) * cp, Math.sin(aim.pitch), -Math.cos(aim.yaw) * cp]; },
        /** before the vehicles step: controls in, wheel input out (`inputs`) */
        control(dt, driving, input, inputs) {
            for (const [c, p] of list)
            {
                const flying = c === driving, k = n => (flying && input?.key(n)) ? 1 : 0, ctl = p.air.controls;
                if (flying)
                {
                    const grounded = c.car.wheels.some(w => w.grounded), a = p.air, side = k('d') - k('a');
                    // flaps by speed: down slow (take off, landing), up fast
                    const high = c.car.body.position.y - range.ground(c.car.body.position.x, c.car.body.position.z);
                    ctl.flaps = grounded || (high < 25 && a.airspeed < 60) ? 1 : 0;
                    if (grounded && a.airspeed < 40)
                    {
                        // taxi / take off run: W holds the throttle up (full on a long press), S brakes then backs up
                        ctl.throttle = k('w') ? Math.min(1, ctl.throttle + dt * .7) : Math.max(0, ctl.throttle - dt * 2);
                        ctl.brake = !!k('s');
                        ctl.yaw = side; ctl.roll = 0;
                        // lift off: once fast enough the aim (mouse up) pulls the nose
                        instruct(a, this.aimDir());
                        ctl.roll = 0; ctl.yaw = side;
                        if (a.airspeed < 45) ctl.pitch = Math.max(0, ctl.pitch);
                        p.reverse = k('s') && Math.abs(c.car.speed) < 1.5 || (p.reverse && k('s'));
                    }
                    else
                    {
                        ctl.throttle = Math.max(.05, Math.min(1, ctl.throttle + (k('w') - k('s')) * dt * .5));
                        ctl.brake = false; p.reverse = false;
                        instruct(a, this.aimDir(), side);
                    }
                }
                else { ctl.pitch = ctl.roll = ctl.yaw = 0; p.guns.trigger = false; }
                // backing up on the ground: the wheels pull (a tug, really), slowly
                inputs.set(c.car, flying && p.reverse ? { throttle: -1, steer: ctl.yaw } : p.air.drive(flying));
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
            return `${(a.airspeed * 3.6).toFixed(0)} km/h · ${h.toFixed(0)} m · thr ${(a.controls.throttle * 100).toFixed(0)}% · ${a.g.toFixed(1)} g${a.controls.flaps ? ' · flaps' : ''}${a.stalled ? ' · STALL' : ''} · ammo ${p.guns.total}`;
        },
    };
}
