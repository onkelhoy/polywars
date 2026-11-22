/**
 * The rain AudioWorklet (source text, loaded from a Blob). Every drop is an event (random arrival times):
 * an impact tick (shaped noise), and by surface a bubble (a sine that bends up as it dies, the "plink" of drops
 * into water), a leaf flick (a short ring) or a membrane thump (tent), plus a kick into that surface's shared
 * resonator bank (tin roof, car body). A distant layer is thousands of tiny far impacts per second with mostly
 * small, sometimes big amplitudes through a soft band: it crackles like rain instead of hissing like static.
 * Output 0 = outside (the host muffles it indoors), output 1 = overhead (roof / tent / car you're under).
 */
export const RAIN_WORKLET = /* js */`
const SR = sampleRate, TAU = Math.PI * 2;
const MAXV = 384;

// a two pole resonator, stereo, kicked by impulses
class Bank {
    constructor(modes) {
        this.m = modes.map(([f, t, g]) => {
            const r = Math.exp(-1 / (t * SR)), w = TAU * f / SR;
            return { a1: 2 * r * Math.cos(w), a2: -r * r, g: g * (1 - r), l1: 0, l2: 0, r1: 0, r2: 0 };
        });
        this.inL = 0; this.inR = 0;
    }
    kick(a, pan) { this.inL += a * (1 - pan); this.inR += a * pan; }
    step(out) {
        let L = 0, R = 0;
        for (const m of this.m) {
            const l = m.a1 * m.l1 + m.a2 * m.l2 + this.inL, r = m.a1 * m.r1 + m.a2 * m.r2 + this.inR;
            m.l2 = m.l1; m.l1 = l; m.r2 = m.r1; m.r1 = r;
            L += l * m.g; R += r * m.g;
        }
        this.inL = this.inR = 0;
        out[0] = L; out[1] = R;
    }
}

// one pole lowpass / highpass, stereo
const lp = (f) => ({ a: 1 - Math.exp(-TAU * f / SR), l: 0, r: 0 });

// surfaces: banks for the ones that ring
const BANKS = {
    roof: [[620, .05, 1], [1340, .06, .9], [2210, .05, .8], [3150, .04, .6], [4630, .03, .4]],
    vehicle: [[310, .04, 1], [760, .05, .8], [1290, .04, .6], [2140, .03, .5], [3400, .02, .3]],
    tent: [[140, .03, 1], [230, .025, .7], [410, .02, .4]],
    ground: [[180, .012, 1], [420, .01, .5]],
};
const OVER = { roof: 1, tent: 1, vehicle: 1 };

class Rain extends AudioWorkletProcessor {
    constructor() {
        super();
        this.p = { rain: 0, surfaces: { ground: 1 }, over: {} };
        this.port.onmessage = e => Object.assign(this.p, e.data);
        // voices: kind 0 noise tick, 1 sine (bubble / ring / thump)
        this.v = [];
        for (let i = 0; i < MAXV; i++) this.v.push({ on: 0, out: 0, kind: 0, a: 0, d: 0, ph: 0, f: 0, df: 1, b: .5, y: 0, pl: .5, pr: .5 });
        this.banks = {};
        for (const k in BANKS) this.banks[k] = new Bank(BANKS[k]);
        this.tmp = [0, 0];
        this.queue = []; // delayed drips [samplesLeft, surface, level]
        this.carry = { near: 0, far: 0, over: 0 };
        // distant layer: two soft bands + a slow swell
        this.far = { lo: lp(250), hi: lp(2200), sw: 1, swT: 0, goal: 1 };
        this.hp = [lp(90), lp(90)];
        this.top = [lp(5000), lp(6500)];
    }
    voice(out, kind, a, d, f, df, b, pan) {
        for (const v of this.v) if (!v.on) {
            v.on = 1; v.out = out; v.kind = kind; v.a = a; v.d = Math.exp(-1 / (d * SR)); v.f = TAU * f / SR; v.df = df; v.b = b; v.ph = Math.random() * TAU; v.y = 0;
            v.pl = Math.cos(pan * Math.PI / 2); v.pr = Math.sin(pan * Math.PI / 2);
            return;
        }
    }
    // one drop on a surface; level 0..1
    drop(s, level) {
        const pan = Math.random(), R = Math.random, out = OVER[s] ? 1 : 0;
        const big = Math.pow(R(), 2.2) * level;
        if (s === "water") {
            this.voice(0, 0, big * .2, .0008, 0, 1, .2, pan);
            // Minnaert bubble: small drops ring high, bends up as it dies
            if (R() < .8) { const f = 600 + Math.pow(R(), 2) * 2600, t = .004 + R() * .012; this.voice(0, 1, big * .6, t, f, Math.pow(1.5, 1 / (t * SR * 3)), 0, pan); }
        } else if (s === "leaves") {
            this.voice(0, 0, big * .45, .0006 + R() * .0008, 0, 1, .2 + R() * .25, pan);
            this.voice(0, 1, big * .25, .002 + R() * .005, 350 + R() * 1400, 1, 0, pan);
            // the leaf lets go of it again, a bit later and lower
            if (R() < .25) this.queue.push([Math.floor((.05 + R() * .4) * SR), "ground", level * .6]);
        } else if (s === "ground") {
            this.voice(0, 0, big * .4, .0015 + R() * .002, 0, 1, .05 + R() * .1, pan);
            this.banks.ground.kick(big * .5, pan);
            // a little puddle now and then
            if (R() < .15) { const f = 700 + R() * 2000, t = .005 + R() * .008; this.voice(0, 1, big * .25, t, f, Math.pow(1.4, 1 / (t * SR * 3)), 0, pan); }
        } else if (s === "roof") {
            this.voice(1, 0, big * .3, .0005, 0, 1, .3, pan);
            this.banks.roof.kick(big * (.8 + R()), pan);
        } else if (s === "vehicle") {
            this.voice(1, 0, big * .3, .0005, 0, 1, .35, pan);
            this.banks.vehicle.kick(big * (.8 + R()), pan);
        } else if (s === "tent") {
            this.voice(1, 1, big * .35, .008 + R() * .008, 150 + R() * 160, .99995, 0, pan);
            this.voice(1, 0, big * .2, .0008, 0, 1, .25, pan);
            this.banks.tent.kick(big * .6, pan);
        }
    }
    pick(w) {
        let r = Math.random();
        for (const k in w) if ((r -= w[k]) <= 0) return k;
        return "ground";
    }
    process(_, outputs) {
        const o0 = outputs[0], o1 = outputs[1], n = o0[0].length, p = this.p, k = Math.max(0, Math.min(1, p.rain));
        const sum = o => { let s = 0; for (const x in o) s += o[x]; return s; };
        const sw = sum(p.surfaces) || 1, ow = sum(p.over);
        const near = {}; for (const x in p.surfaces) near[x] = p.surfaces[x] / sw;
        const over = {}; for (const x in p.over) over[x] = p.over[x] / (ow || 1);
        // drops per second: mild = countable, dense = a downpour
        const rNear = (k > .002 ? 3 + 900 * Math.pow(k, 1.6) : 0) / SR;
        const rOver = ow > 0 ? (k > .002 ? 5 + 1400 * Math.pow(k, 1.5) : 0) / SR : 0;
        const rFar = (k > .002 ? 300 + 22000 * k : 0) / SR;
        const far = this.far, tmp = this.tmp;
        for (let i = 0; i < n; i++) {
            // arrivals
            this.carry.near += rNear; while (this.carry.near > Math.random() * 2) { this.carry.near -= 1; this.drop(this.pick(near), .4 + .6 * Math.sqrt(k)); }
            this.carry.over += rOver; while (this.carry.over > Math.random() * 2) { this.carry.over -= 1; this.drop(this.pick(over), .5 + .5 * Math.sqrt(k)); }
            let L0 = 0, R0 = 0, L1 = 0, R1 = 0;
            // distant crackle: sparse impulses with a heavy tail, banded, swelling slowly
            this.carry.far += rFar;
            let imp = 0, impR = 0;
            while (this.carry.far > Math.random() * 2) { this.carry.far -= 1; const a = Math.pow(Math.random(), 3) * (Math.random() < .5 ? -1 : 1), pn = Math.random(); imp += a * (1 - pn); impR += a * pn; }
            if (--far.swT <= 0) { far.swT = SR * (.3 + Math.random()); far.goal = .7 + Math.random() * .6; }
            far.sw += (far.goal - far.sw) * .00005;
            far.lo.l += (imp - far.lo.l) * far.lo.a; far.lo.r += (impR - far.lo.r) * far.lo.a;
            far.hi.l += (imp - far.hi.l) * far.hi.a; far.hi.r += (impR - far.hi.r) * far.hi.a;
            // band = hi - lo (roughly 0.7 - 4 kHz), plus some of the low for body
            const g = (.9 + .6 * k) * far.sw;
            L0 += ((far.hi.l - far.lo.l) * 1.6 + far.lo.l * .9) * g; R0 += ((far.hi.r - far.lo.r) * 1.6 + far.lo.r * .9) * g;
            // voices
            for (const v of this.v) {
                if (!v.on) continue;
                let s;
                if (v.kind === 0) { v.y += ((Math.random() * 2 - 1) - v.y) * v.b; s = v.y * v.a; }
                else { v.ph += v.f; v.f *= v.df; s = Math.sin(v.ph) * v.a; }
                v.a *= v.d;
                if (v.a < 2e-4) v.on = 0;
                if (v.out) { L1 += s * v.pl; R1 += s * v.pr; } else { L0 += s * v.pl; R0 += s * v.pr; }
            }
            this.banks.ground.step(tmp); L0 += tmp[0]; R0 += tmp[1];
            for (const b of ["roof", "vehicle", "tent"]) { this.banks[b].step(tmp); L1 += tmp[0] * 4; R1 += tmp[1] * 4; }
            // delayed drips
            if (this.queue.length && (i & 31) === 0) for (let q = this.queue.length - 1; q >= 0; q--) { if ((this.queue[q][0] -= 32) <= 0) { this.drop(this.queue[q][1], this.queue[q][2]); this.queue.splice(q, 1); } }
            // no rumble below ~90 Hz on the outside
            const h = this.hp[0]; h.l += (L0 - h.l) * h.a; h.r += (R0 - h.r) * h.a;
            const t0 = this.top[0], t1 = this.top[1];
            t0.l += (L0 - h.l - t0.l) * t0.a; t0.r += (R0 - h.r - t0.r) * t0.a;
            t1.l += (L1 - t1.l) * t1.a; t1.r += (R1 - t1.r) * t1.a;
            o0[0][i] = Math.tanh(t0.l * 1.1); o0[1][i] = Math.tanh(t0.r * 1.1);
            if (o1) { o1[0][i] = Math.tanh(t1.l); o1[1][i] = Math.tanh(t1.r); }
        }
        return true;
    }
}
registerProcessor("pw-rain", Rain);
`;
