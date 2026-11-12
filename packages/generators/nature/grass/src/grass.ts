import type { Layer3D } from "@papit/game-engine";
import { Matrix4 } from "@papit/matrix";
import { place, type Placed } from "./place";
import { noise } from "./noise";
import { DEFAULTS, linear, resolve, type Resolved } from "./presets";
import { GROUND_FRAGMENT, GROUND_VERTEX, TUFT_FRAGMENT, TUFT_VERTEX } from "./shaders";
import { sprite } from "./sprites";
import type { GrassOptions, GrassSettings, Light, Planting, Pusher, Quality, View } from "./types";

type Program = { name: string; program: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

let ids = 0;
type Geometry = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; indexed?: number };

const MODES = { sprite: 0, cross: 1, mesh: 2 } as const;

/**
 * GPU grass. Plant an area, then `draw` each frame (and `drawGround` for the matching floor).
 * Everything visual is in `options`; `quality` picks a preset of the costly parts.
 */
export class Grass {
    private o: Resolved;
    private tufts?: Program;
    private groundProgram?: Program;
    private geometry?: Geometry;
    private instances: WebGLBuffer;
    private noiseTex?: WebGLTexture;
    private sprites: WebGLTexture[] = [];
    private masks = [1, 1, 1, 1];
    private planting?: Planting;
    private placed?: Placed;
    private ground?: Geometry;
    private pushers = new Float32Array(0);
    private f32 = { view: new Float32Array(16), projection: new Float32Array(16) };
    /** tufts drawn last frame */
    drawn = 0;

    readonly gl: WebGL2RenderingContext;
    private id = ids++;
    private version = 0;

    /** Programs come from the layer (async); draws are skipped until they are linked. */
    constructor(readonly layer: Layer3D, options: Partial<GrassOptions> = {}) {
        this.gl = layer.gl;
        this.o = resolve(options);
        this.instances = this.gl.createBuffer()!;
        this.rebuild(true);
    }

    get options(): Readonly<Resolved> { return this.o; }

    /** Current settings as plain JSON data: `new Grass(gl, settings)` or `grass.load(settings)` brings them back. */
    toJSON(): GrassSettings {
        const { q: _q, s: _s, mesh: _m, sprites, ...rest } = this.o;
        const out: GrassSettings = structuredClone(rest);
        if (sprites?.some(s => typeof s === "string")) out.sprites = sprites.map(s => typeof s === "string" ? s : null);
        return out;
    }

    /** Replace all settings (missing fields fall back to the defaults). Keeps the mesh unless given. */
    load(settings: Partial<GrassSettings> | string) {
        const data: Partial<GrassSettings> = typeof settings === "string" ? JSON.parse(settings) : settings;
        this.set({ ...DEFAULTS, mesh: this.o.mesh, ...data });
    }
    /** tufts planted */
    get count() { return this.placed?.count ?? 0; }

    get quality() { return this.o.quality; }
    set quality(quality: Quality) { this.set({ quality }); }

    /** Merge options. Rebuilds only what the change needs (shader, geometry, textures, planting). */
    set(options: Partial<GrassOptions>) {
        const before = this.o;
        this.o = resolve({ ...stripResolved(before), ...options });
        const q = this.o.q, b = before.q;
        if (q.pushers !== b.pushers) this.compile();
        if (q.source !== b.source || q.planes !== b.planes || this.o.mesh !== before.mesh) this.buildGeometry();
        if (q.noiseSize !== b.noiseSize) this.buildNoise();
        if (this.o.s.pixels !== before.s.pixels || this.o.s.pixelated !== before.s.pixelated || this.o.sprites !== before.sprites) this.buildSprites();
        if (this.planting && (q.density !== b.density || q.maxTufts !== b.maxTufts || this.o.chunk !== before.chunk || this.o.sizeJitter !== before.sizeJitter)) this.plant(this.planting);
    }

    /** Grow grass over an area. Replaces what was planted. */
    plant(planting: Planting) {
        const gl = this.gl;
        this.planting = planting;
        this.placed = place(planting, this.o.q.density, this.o.chunk, this.o.q.maxTufts, this.o.sizeJitter);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
        gl.bufferData(gl.ARRAY_BUFFER, this.placed.data, gl.STATIC_DRAW);
        this.buildGround();
    }

    /** Characters that bend grass: x y z radius each. Only the first `pushers` (quality) count. */
    push(pushers: Pusher[]) {
        const n = Math.min(pushers.length, this.o.q.pushers);
        if (this.pushers.length !== n * 4) this.pushers = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) this.pushers.set(pushers[i], i * 4);
    }

    /** `time` in seconds */
    draw(view: View, light: Light, time: number) {
        const gl = this.gl, o = this.o, q = o.q, s = o.s, placed = this.placed, geo = this.geometry;
        if (!placed || !geo || !this.tufts) return;
        const p = this.tufts, u = p.u;
        gl.useProgram(p.program);
        this.common(p, view, light, time);
        gl.uniform1i(u("mode"), MODES[q.source]);
        gl.uniform1i(u("debug"), o.debug === "wind" ? 1 : o.debug === "push" ? 2 : 0);
        gl.uniform1f(u("time"), time);
        gl.uniform1f(u("framerate"), s.framerate);
        gl.uniform1i(u("stepped"), s.stepped ? 1 : 0);
        gl.uniform1f(u("maxDistance"), q.distance);
        gl.uniform2f(u("size"), o.size[0] * q.sizeScale, o.size[1] * q.sizeScale);
        gl.uniform2fv(u("windDirection"), o.wind.direction);
        gl.uniform1f(u("windSpeed"), o.wind.speed);
        gl.uniform1f(u("windScale"), o.wind.scale);
        gl.uniform1f(u("windThreshold"), o.wind.threshold);
        gl.uniform1f(u("windDiverge"), o.wind.diverge);
        gl.uniform1f(u("windAngle"), o.wind.angle);
        gl.uniform1f(u("perspective"), o.wind.perspective);
        gl.uniform1f(u("swaySpeed"), o.sway.speed);
        gl.uniform1f(u("swayAngle"), o.sway.angle);
        gl.uniform1f(u("pushAngle"), o.push.angle);
        gl.uniform1f(u("pushExponent"), o.push.exponent);
        gl.uniform1i(u("pusherCount"), this.pushers.length / 4);
        if (this.pushers.length) gl.uniform4fv(u("pushers"), this.pushers);
        const a = [o.accents[0], o.accents[1]];
        gl.uniform2f(u("accentChance"), a[0]?.chance ?? 0, a[1]?.chance ?? 0);
        gl.uniform2f(u("accentHeight"), a[0]?.height ?? 0, a[1]?.height ?? 0);
        gl.uniform2f(u("accentScale"), a[0]?.scale ?? 1, a[1]?.scale ?? 1);
        gl.uniform3fv(u("accentColor"), [...linear(a[0]?.color ?? o.color), ...linear(a[1]?.color ?? o.color)]);
        gl.uniform4fv(u("spriteMask"), this.masks);
        gl.uniform4f(u("spriteAnchor"), .5, 0, 0, 0);
        gl.uniform1f(u("bladeShare"), o.shape === "leaves" ? 0 : o.shape === "blades" ? 1 : o.bladeShare);
        gl.uniform1f(u("variation"), o.variation);
        this.sprites.forEach((t, i) => {
            gl.activeTexture(gl.TEXTURE1 + i);
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.uniform1i(u("sprite" + i), 1 + i);
        });

        const cull = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(geo.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
        const planes = frustum(this.f32.projection, this.f32.view);
        const eye = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        this.drawn = 0;
        for (const c of placed.chunks)
        {
            const d = Math.max(0, Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) - c.radius);
            if (d > q.distance || !visible(planes, c.x, c.y, c.z, c.radius + o.size[1] * 2)) continue;
            const n = Math.ceil(c.count * (1 - (1 - q.lod) * d / q.distance));
            gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 16, c.offset * 16);
            if (geo.indexed !== undefined) gl.drawElementsInstanced(gl.TRIANGLES, geo.count, geo.indexed, 0, n);
            else gl.drawArraysInstanced(gl.TRIANGLES, 0, geo.count, n);
            this.drawn += n;
        }
        gl.bindVertexArray(null);
        if (cull) gl.enable(gl.CULL_FACE);
    }

    /** The floor under the grass with the same patches, light and clouds. `darken` scales its colour. */
    drawGround(view: View, light: Light, time: number, darken = .8) {
        const gl = this.gl, g = this.ground, p = this.groundProgram;
        if (!g || !p) return;
        gl.useProgram(p.program);
        this.common(p, view, light, time);
        // pixel style: one texel per sprite pixel
        gl.uniform1f(p.u("texel"), this.o.s.pixelated ? this.o.size[0] * this.o.q.sizeScale / this.o.s.pixels : 0);
        gl.uniform1f(p.u("darken"), darken);
        gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(g.vao);
        gl.drawElements(gl.TRIANGLES, g.count, g.indexed!, 0);
        gl.bindVertexArray(null);
    }

    destroy() {
        const gl = this.gl;
        for (const g of [this.geometry, this.ground]) if (g) { gl.deleteVertexArray(g.vao); g.buffers.forEach(b => gl.deleteBuffer(b)); }
        gl.deleteBuffer(this.instances);
        [this.noiseTex, ...this.sprites].forEach(t => t && gl.deleteTexture(t));
        [this.tufts, this.groundProgram].forEach(p => p && this.layer.deleteProgram(p.name));
    }

    // ---- internals ----

    private rebuild(all: boolean) {
        if (all) { this.compile(); this.buildGeometry(); this.buildNoise(); this.buildSprites(); }
        if (!this.groundProgram) this.link(`grass-${this.id}-ground`, GROUND_VERTEX, GROUND_FRAGMENT).then(p => this.groundProgram = p);
    }

    /** uniforms both programs share: camera, light, colours, clouds */
    private common(p: Program, view: View, light: Light, time: number) {
        const gl = this.gl, u = p.u, o = this.o;
        this.f32.view.set(view.viewMatrix);
        this.f32.projection.set(view.projectionMatrix);
        gl.uniformMatrix4fv(u("view"), false, this.f32.view);
        gl.uniformMatrix4fv(u("projection"), false, this.f32.projection);
        const e = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        gl.uniform3f(u("eye"), e.x, e.y, e.z);
        gl.uniform3fv(u("sunDirection"), light.sunDirection);
        gl.uniform3fv(u("sunColor"), light.sunColor);
        gl.uniform1f(u("sunStrength"), light.sunStrength);
        gl.uniform3fv(u("sky"), light.sky);
        gl.uniform3fv(u("ground"), light.ground);
        gl.uniform1f(u("ambient"), light.ambient);
        gl.uniform3fv(u("fogColor"), light.fogColor);
        gl.uniform1f(u("fogDensity"), light.fogDensity);
        gl.uniform3fv(u("grassColor"), linear(o.color));
        const pa = [o.patches[0], o.patches[1]];
        gl.uniform3fv(u("patchColor"), [...linear(pa[0]?.color ?? o.color), ...linear(pa[1]?.color ?? o.color)]);
        gl.uniform3fv(u("patchNoise"), [pa[0]?.scale ?? 0, pa[0]?.threshold ?? 2, pa[0]?.softness ?? 0, pa[1]?.scale ?? 0, pa[1]?.threshold ?? 2, pa[1]?.softness ?? 0]);
        gl.uniform1f(u("bands"), o.s.bands);
        gl.uniform1f(u("softBands"), o.q.softBands);
        gl.uniform1f(u("wrap"), o.lighting.wrap);
        gl.uniform1f(u("steepness"), o.lighting.steepness);
        const c = o.clouds;
        gl.uniform1i(u("clouds"), o.q.clouds ? 1 : 0);
        gl.uniform1f(u("cloudTime"), time);
        gl.uniform2fv(u("cloudDirection"), c.direction);
        gl.uniform1f(u("cloudScale"), c.scale);
        gl.uniform1f(u("cloudSpeed"), c.speed);
        gl.uniform1f(u("cloudHeight"), c.height);
        gl.uniform1f(u("cloudContrast"), c.contrast);
        gl.uniform1f(u("cloudThreshold"), c.threshold);
        gl.uniform1f(u("cloudMin"), c.min);
        gl.uniform1f(u("cloudDiverge"), c.diverge);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex!);
        gl.uniform1i(u("noiseTex"), 0);
    }

    private compile() {
        const version = ++this.version;
        this.link(`grass-${this.id}-tufts-${version}`, TUFT_VERTEX(this.o.q.pushers), TUFT_FRAGMENT).then(p => {
            // a newer compile may have started meanwhile
            if (version !== this.version) return this.layer.deleteProgram(p.name);
            if (this.tufts) this.layer.deleteProgram(this.tufts.name);
            this.tufts = p;
        });
    }

    private async link(name: string, vertex: string, fragment: string): Promise<Program> {
        const gl = this.gl, program = await this.layer.createProgram(name, vertex, fragment);
        const cache = new Map<string, WebGLUniformLocation | null>();
        return { name, program, u: n => cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(program, n)), cache.get(n)!) };
    }

    /** One tuft: a quad, crossed quads or the given mesh. Attributes: 0 position, 1 normal, 2 uv, 4 tuft (instanced). */
    private buildGeometry() {
        const gl = this.gl, q = this.o.q;
        let positions: number[] = [], normals: number[] = [], uvs: number[] = [];
        let indices: Uint16Array | Uint32Array | undefined;
        const quad = (angle: number) => {
            const c = Math.cos(angle), s = Math.sin(angle);
            for (const [x, y] of [[-.5, 0], [.5, 0], [.5, 1], [-.5, 0], [.5, 1], [-.5, 1]])
            {
                positions.push(x * c, y, x * s);
                normals.push(0, 1, 0);
                uvs.push(x + .5, y);
            }
        };
        if (q.source === "mesh" && this.o.mesh)
        {
            const m = this.o.mesh;
            let top = 1e-6;
            for (let i = 1; i < m.positions.length; i += 3) top = Math.max(top, m.positions[i]);
            positions = Array.from(m.positions, v => v / top);
            normals = Array.from(m.normals);
            for (let i = 0; i < m.positions.length; i += 3) uvs.push(0, m.positions[i + 1] / top);
            indices = m.indices;
        }
        else if (q.source === "cross") for (let i = 0; i < q.planes; i++) quad(i * Math.PI / q.planes);
        else quad(0);

        if (this.geometry) { gl.deleteVertexArray(this.geometry.vao); this.geometry.buffers.forEach(b => gl.deleteBuffer(b)); }
        const vao = gl.createVertexArray()!, buffers: WebGLBuffer[] = [];
        gl.bindVertexArray(vao);
        const attribute = (location: number, data: number[], size: number) => {
            const b = gl.createBuffer()!;
            buffers.push(b);
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        };
        attribute(0, positions, 3);
        attribute(1, normals, 3);
        attribute(2, uvs, 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 16, 0);
        gl.vertexAttribDivisor(4, 1);
        let indexed: number | undefined;
        if (indices)
        {
            const b = gl.createBuffer()!;
            buffers.push(b);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            indexed = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        }
        gl.bindVertexArray(null);
        this.geometry = { vao, buffers, count: indices ? indices.length : positions.length / 3, indexed };
    }

    private buildNoise() {
        const gl = this.gl, n = this.o.q.noiseSize;
        this.noiseTex ??= gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise(n));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
    }

    /** Generated sprites, replaced by `options.sprites` entries when given (urls load async). */
    private buildSprites() {
        const gl = this.gl, s = this.o.s;
        const kinds = ["leaves", "flower", "leafy", "tuft"] as const;
        kinds.forEach((kind, i) => {
            const t = this.sprites[i] ??= gl.createTexture()!;
            const custom = this.o.sprites?.[i];
            const img = sprite(kind, s.pixels, i + 1);
            this.upload(t, { width: img.width, height: img.height, data: img.data });
            this.masks[i] = 1;
            if (!custom) return;
            const apply = (source: TexImageSource) => { if (this.o.sprites?.[i] === custom) { this.upload(t, source); this.masks[i] = 0; } };
            if (typeof custom === "string")
            {
                const image = new Image();
                image.onload = () => apply(image);
                image.src = custom;
            }
            else apply(custom);
        });
    }

    private upload(texture: WebGLTexture, source: TexImageSource | { width: number; height: number; data: Uint8Array }) {
        const gl = this.gl, pixel = this.o.s.pixelated;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if ("data" in source)
        {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
        }
        else
        {
            // images are stored top row first, the tuft uv has v = 0 at the root
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, pixel ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, pixel ? gl.NEAREST : gl.LINEAR);
        if (!pixel) gl.generateMipmap(gl.TEXTURE_2D);
    }

    /** grid over the planted area, following `height`, about 1 m cells */
    private buildGround() {
        const gl = this.gl, pl = this.planting!, a = pl.area;
        const nx = Math.min(256, Math.max(1, Math.ceil(a.width))), nz = Math.min(256, Math.max(1, Math.ceil(a.depth)));
        const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
        for (let j = 0, k = 0; j <= nz; j++) for (let i = 0; i <= nx; i++)
        {
            const x = a.x + a.width * i / nx, z = a.z + a.depth * j / nz;
            positions.set([x, pl.height ? pl.height(x, z) : 0, z], k);
            k += 3;
        }
        const indices = new Uint32Array(nx * nz * 6);
        for (let j = 0, k = 0; j < nz; j++) for (let i = 0; i < nx; i++)
        {
            const v = j * (nx + 1) + i;
            indices.set([v, v + nx + 1, v + 1, v + 1, v + nx + 1, v + nx + 2], k);
            k += 6;
        }
        if (this.ground) { gl.deleteVertexArray(this.ground.vao); this.ground.buffers.forEach(b => gl.deleteBuffer(b)); }
        const vao = gl.createVertexArray()!, pb = gl.createBuffer()!, ib = gl.createBuffer()!;
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, pb);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        this.ground = { vao, buffers: [pb, ib], count: indices.length, indexed: gl.UNSIGNED_INT };
    }
}

function stripResolved(o: Resolved): Partial<GrassOptions> {
    const { q: _q, s: _s, ...rest } = o;
    return rest;
}

/** 6 planes (a b c d) of projection * view */
function frustum(p: Float32Array, v: Float32Array) {
    const m = Matrix4.create(p).multiply(Matrix4.create(v));
    const row = (r: number) => Array.from(m.getRow(r));
    const w = row(3), planes: number[][] = [];
    for (let r = 0; r < 3; r++)
    {
        const x = row(r);
        planes.push(w.map((e, i) => e + x[i]), w.map((e, i) => e - x[i]));
    }
    return planes.map(([a, b, c, d]) => { const l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l, d / l]; });
}

function visible(planes: number[][], x: number, y: number, z: number, r: number) {
    for (const [a, b, c, d] of planes) if (a * x + b * y + c * z + d < -r) return false;
    return true;
}
