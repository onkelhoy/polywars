/**
 * Top-down 2D map of a ground grid (heights in metres): hillshade + sea, pan (drag) + wheel zoom, scale bar,
 * cursor readout. Overlays draw in `ondraw(ctx, map)` with `map.px(x, z)` → [sx, sy]. `onclick(x, z, e)` in metres.
 * (copied per view folder on purpose, no shared package yet)
 */
export class Map2D {
    constructor(canvas, readout) {
        this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.readout = readout;
        this.ground = null; this.image = null;
        this.scale = 1; this.cx = 0; this.cz = 0; // metres at the centre, px per metre
        this.ondraw = null; this.onclick = null; this.onhover = null;
        let drag = null;
        canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false }; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => {
            const [x, z] = this.world(e.offsetX, e.offsetY);
            this.hover = [x, z];
            if (drag) {
                const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
                if (drag.moved) { this.cx = drag.cx - dx / this.scale; this.cz = drag.cz - dy / this.scale; }
            }
            this.onhover?.(x, z, e);
            this.draw();
        });
        canvas.addEventListener('pointerup', e => {
            if (drag && !drag.moved) { const [x, z] = this.world(e.offsetX, e.offsetY); this.onclick?.(x, z, e); }
            drag = null; this.draw();
        });
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const [x, z] = this.world(e.offsetX, e.offsetY), f = Math.exp(-e.deltaY * .0015);
            this.scale = Math.min(50, Math.max(this.fit * .5, this.scale * f));
            // keep the point under the cursor
            const [sx, sy] = this.px(x, z);
            this.cx += (sx - e.offsetX) / this.scale; this.cz += (sy - e.offsetY) / this.scale;
            this.draw();
        }, { passive: false });
        new ResizeObserver(() => this.resize()).observe(canvas);
    }

    resize() {
        const r = this.canvas.getBoundingClientRect(), d = devicePixelRatio;
        this.canvas.width = r.width * d; this.canvas.height = r.height * d;
        this.w = r.width; this.h = r.height;
        this.ctx.setTransform(d, 0, 0, d, 0, 0);
        if (this.ground && !this.fitted) this.home();
        this.draw();
    }

    /** whole map on screen */
    home() {
        if (!this.ground || !this.w) return;
        this.fit = Math.min(this.w, this.h) / this.ground.size * .95;
        this.scale = this.fit; this.cx = 0; this.cz = 0; this.fitted = true;
    }

    /** `ground`: { n, size, height, seaLevel, water? } */
    setGround(ground) {
        const first = !this.ground || this.ground.size !== ground.size;
        this.ground = ground;
        const { n, height, seaLevel, water } = ground, step = Math.max(1, Math.floor((n - 1) / 1024)), m = Math.floor((n - 1) / step) + 1;
        const cell = ground.size / (n - 1), img = new ImageData(m, m), d = img.data;
        let top = seaLevel + 1;
        for (const v of height) if (v > top) top = v;
        for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
            const gi = Math.min(n - 2, i * step), gj = Math.min(n - 2, j * step), k = gj * n + gi, h = height[k], p = (j * m + i) * 4;
            const w = water ? water[k] : h < seaLevel ? 1 : 0;
            if (w) {
                const deep = Math.min(1, (seaLevel - h) / 40);
                d[p] = 30 - deep * 15; d[p + 1] = 70 - deep * 30; d[p + 2] = w === 1 ? 120 - deep * 40 : 140; d[p + 3] = 255;
                continue;
            }
            // light from the north west
            const dx = (height[k + step < n * n ? k + 1 : k] - height[k > 0 ? k - 1 : k]) / (2 * cell), dz = (height[k + n] - height[Math.max(0, k - n)]) / (2 * cell);
            const shade = Math.max(0, Math.min(1, .7 - (dx + dz) * 1.5));
            const t = (h - seaLevel) / (top - seaLevel);
            const base = t < .5 ? [95 + t * 120, 130 + t * 40, 70 + t * 40] : [155 + (t - .5) * 160, 150 + (t - .5) * 150, 110 + (t - .5) * 220];
            d[p] = base[0] * (.45 + shade * .75); d[p + 1] = base[1] * (.45 + shade * .75); d[p + 2] = base[2] * (.45 + shade * .75); d[p + 3] = 255;
        }
        const c = new OffscreenCanvas(m, m);
        c.getContext('2d').putImageData(img, 0, 0);
        this.image = c;
        if (first) { this.fitted = false; this.home(); }
        this.draw();
    }

    px(x, z) { return [this.w / 2 + (x - this.cx) * this.scale, this.h / 2 + (z - this.cz) * this.scale]; }
    world(sx, sy) { return [this.cx + (sx - this.w / 2) / this.scale, this.cz + (sy - this.h / 2) / this.scale]; }

    heightAt(x, z) {
        const g = this.ground; if (!g) return 0;
        const i = Math.round((x / g.size + .5) * (g.n - 1)), j = Math.round((z / g.size + .5) * (g.n - 1));
        if (i < 0 || j < 0 || i >= g.n || j >= g.n) return NaN;
        return g.height[j * g.n + i];
    }

    draw() {
        if (this.pending) return;
        this.pending = requestAnimationFrame(() => { this.pending = 0; this.paint(); });
    }

    paint() {
        const { ctx, w, h } = this;
        if (!w) return;
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
        if (!this.ground) return;
        const s = this.ground.size, [x0, y0] = this.px(-s / 2, -s / 2);
        ctx.imageSmoothingEnabled = this.scale * s / this.image.width < 2;
        ctx.drawImage(this.image, x0, y0, s * this.scale, s * this.scale);
        this.ondraw?.(ctx, this);
        this.scaleBar();
        if (this.readout && this.hover) {
            const [x, z] = this.hover;
            this.readout.textContent = `x ${x.toFixed(0)}  z ${z.toFixed(0)}  h ${this.heightAt(x, z).toFixed(1)} m`;
        }
    }

    scaleBar() {
        const { ctx } = this, target = 120 / this.scale, p = 10 ** Math.floor(Math.log10(target));
        const m = [1, 2, 5, 10].map(f => f * p).reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a), len = m * this.scale;
        const x = this.w - 20 - len, y = this.h - 20;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, x + len / 2, y - 6);
    }
}
