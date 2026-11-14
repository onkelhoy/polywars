/** Small DSP pieces for offline synthesis: seeded noise, biquads, envelopes, a Schroeder reverb, WAV. */

/** mulberry32: same seed, same sound */
export function random(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type Kind = "lowpass" | "highpass" | "bandpass";

/** RBJ biquad, run in place over `x`. `q` .707 is flat. */
export function biquad(x: Float32Array, rate: number, kind: Kind, frequency: number, q = .707) {
    const w = 2 * Math.PI * Math.min(frequency, rate * .45) / rate, c = Math.cos(w), alpha = Math.sin(w) / (2 * q);
    let b0: number, b1: number, b2: number;
    if (kind === "lowpass") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (kind === "highpass") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++)
    {
        const x0 = x[i], y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x0; y2 = y1; y1 = y0;
        x[i] = y0;
    }
    return x;
}

/** white noise times an envelope `env(t)` (seconds), from `start` on, added into `out` */
export function noise(out: Float32Array, rate: number, rnd: () => number, start: number, length: number, env: (t: number) => number, gain = 1) {
    const s = Math.floor(start * rate), n = Math.min(out.length - s, Math.floor(length * rate));
    for (let i = 0; i < n; i++) out[s + i] += (rnd() * 2 - 1) * env(i / rate) * gain;
    return out;
}

/** a damped sine (a ringing part), frequency gliding from `f0` to `f1` over `glide` seconds */
export function ring(out: Float32Array, rate: number, start: number, f0: number, decay: number, gain: number, f1 = f0, glide = .01, phase = 0) {
    const s = Math.floor(start * rate), n = Math.min(out.length - s, Math.floor(decay * 7 * rate));
    let p = phase;
    for (let i = 0; i < n; i++)
    {
        const t = i / rate, f = f1 + (f0 - f1) * Math.exp(-t / glide);
        p += 2 * Math.PI * f / rate;
        out[s + i] += Math.sin(p) * Math.exp(-t / decay) * gain;
    }
    return out;
}

/** a band of noise (a scrape, a knock body): noise through a bandpass, into `out` */
export function band(out: Float32Array, rate: number, rnd: () => number, start: number, length: number, frequency: number, q: number, env: (t: number) => number, gain = 1) {
    const part = noise(new Float32Array(Math.ceil(length * rate)), rate, rnd, 0, length, env);
    biquad(part, rate, "bandpass", frequency, q);
    biquad(part, rate, "bandpass", frequency, q);
    return mix(out, part, start, rate, gain * Math.sqrt(q));
}

/** `part` added into `out` at `start` seconds */
export function mix(out: Float32Array, part: Float32Array, start: number, rate: number, gain = 1) {
    const s = Math.floor(start * rate), n = Math.min(part.length, out.length - s);
    for (let i = 0; i < n; i++) out[s + i] += part[i] * gain;
    return out;
}

/** attack-decay envelope: up in `attack`, then e^(-t/decay) */
export const ad = (attack: number, decay: number) => (t: number) => t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/**
 * Schroeder / Freeverb style room: 8 combs in parallel, 4 allpasses in a row. `size` 0..1 (delay lengths),
 * `decay` seconds to -60 dB, `damp` 0..1 (highs die faster). Returns only the wet part.
 */
export function reverb(x: Float32Array, rate: number, size: number, decay: number, damp: number) {
    const k = rate / 44100 * (.4 + size * .8);
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(n => Math.floor(n * k));
    const passes = [556, 441, 341, 225].map(n => Math.floor(n * rate / 44100));
    const out = new Float32Array(x.length);
    for (const length of combs)
    {
        const buffer = new Float32Array(length), feedback = Math.pow(10, -3 * length / rate / decay);
        let i = 0, low = 0;
        for (let n = 0; n < x.length; n++)
        {
            const y = buffer[i];
            low = y * (1 - damp) + low * damp;
            buffer[i] = x[n] + low * feedback;
            out[n] += y / combs.length;
            if (++i >= length) i = 0;
        }
    }
    for (const length of passes)
    {
        const buffer = new Float32Array(length);
        let i = 0;
        for (let n = 0; n < out.length; n++)
        {
            const b = buffer[i], v = out[n];
            buffer[i] = v + b * .5;
            out[n] = b - v * .5;
            if (++i >= length) i = 0;
        }
    }
    return out;
}

/** soft clip (tanh) so stacked parts saturate like a real blast instead of wrapping */
export function saturate(x: Float32Array, drive = 1) {
    const t = Math.tanh(drive);
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / t;
    return x;
}

/** scales the loudest sample to `peak`, cuts the silence (under -60 dB) off the end, fades the last `tail` seconds out */
export function finish(x: Float32Array, rate: number, peak = .95, tail = .02) {
    let max = 0;
    for (let i = 0; i < x.length; i++) max = Math.max(max, Math.abs(x[i]));
    let end = x.length;
    while (end > 1 && Math.abs(x[end - 1]) < max * .001) end--;
    x = x.subarray(0, Math.min(x.length, end + Math.floor(tail * rate)));
    const g = max > 0 ? peak / max : 0, fade = Math.floor(tail * rate);
    for (let i = 0; i < x.length; i++)
    {
        const left = x.length - 1 - i;
        x[i] *= g * (left < fade ? left / fade : 1);
    }
    return x;
}

/** 16 bit mono PCM WAV */
export function wav(x: Float32Array, rate: number): Uint8Array {
    const bytes = new Uint8Array(44 + x.length * 2), view = new DataView(bytes.buffer);
    const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
    text(0, "RIFF"); view.setUint32(4, 36 + x.length * 2, true); text(8, "WAVE");
    text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, "data"); view.setUint32(40, x.length * 2, true);
    for (let i = 0; i < x.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
    return bytes;
}
