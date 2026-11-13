import type { Layer3D } from "@papit/game-engine";
import { INSTANCE_STRIDE, type Instances, type View } from "./renderer";

/** `overlay`: lines and points on top of the shaded meshes, `only`: just the lines (fill skipped by the caller) */
export type WireMode = "off" | "overlay" | "only";

/** a drawable mesh: its VAO (position at attribute 0) and the triangle indices (none = 0..count-1) */
export type WireMesh = { vao: WebGLVertexArrayObject; count: number; indices?: ArrayLike<number> };

export type WireOptions = {
    /** model matrix (default identity) */
    model?: ArrayLike<number>;
    /** same instances as `Renderer.drawInstanced` (place, yaw, scale, sway, fade, billboard) */
    instances?: Instances;
    /** terrain walls: vertices with attribute 3 < -1.5 hang this many metres down (see `@polywar/terrain-material`) */
    wallDrop?: number;
};

type Edges = { buffer: WebGLBuffer; count: number; type: number };

const VERTEX = `#version 300 es
layout(location = 0) in vec3 position;
layout(location = 3) in float flow;
layout(location = 6) in vec4 instance;
layout(location = 7) in vec4 extra;
uniform mat4 model, view, projection;
uniform bool instanced, billboard, walls;
uniform vec3 wind, eye;
uniform vec2 fade;
uniform float time, swayHeight, wallDrop, pointSize;
void main() {
    vec4 local = model * vec4(position, 1.0);
    if (walls && flow < -1.5) local.y -= wallDrop;
    vec3 world = local.xyz;
    if (instanced) {
        // as the instanced prop shader
        vec2 toEye = eye.xz - instance.xz;
        float yaw = billboard ? atan(toEye.x, toEye.y) : extra.x;
        float c = cos(yaw), s = sin(yaw);
        float shrink = fade.y > 0.0 ? 1.0 - smoothstep(fade.x, fade.y, length(instance.xyz - eye)) : 1.0;
        vec3 p = local.xyz * instance.w * shrink;
        vec3 r = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
        float h = clamp(local.y / max(swayHeight, 1e-3), 0.0, 1.0);
        float phase = dot(instance.xz, vec2(.37, .21));
        r.xz += wind.xy * extra.z * wind.z * h * h * (.6 + .4 * sin(time * 1.7 + phase)) * instance.w;
        world = r + instance.xyz;
    }
    gl_Position = projection * view * vec4(world, 1.0);
    // a little towards the eye so the lines win over their own faces
    gl_Position.z -= .0004 * gl_Position.w;
    gl_PointSize = pointSize;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 colour;
out vec4 outColor;
void main() { outColor = vec4(colour.rgb * colour.a, colour.a); }`;

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
let wires = 0;

/**
 * Debug wireframe: draws any mesh's triangle edges as lines and its vertices as points, over or instead of the fill.
 * Edge lists are built once per mesh (cached by its VAO). Uses its own program: call `Renderer.reset()` before more renderer draws.
 */
export class Wire {
    /** line colour (sRGB, alpha) */
    lineColour: [number, number, number, number] = [0, 0, 0, .55];
    /** vertex colour; alpha 0 hides the points */
    pointColour: [number, number, number, number] = [1, 1, 1, .9];
    /** pixels */
    pointSize = 3;
    private program?: WebGLProgram;
    private u: Record<string, WebGLUniformLocation | null> = {};
    /** edge lists by the mesh's VAO */
    private cache = new WeakMap<WebGLVertexArrayObject, Edges>();
    private buffers: WebGLBuffer[] = [];
    private f32 = { model: new Float32Array(16), view: new Float32Array(16), projection: new Float32Array(16) };
    readonly gl: WebGL2RenderingContext;
    readonly ready: Promise<void>;

    constructor(readonly layer: Layer3D) {
        this.gl = layer.gl;
        this.ready = layer.createProgram(`pw-wire-${wires++}`, VERTEX, FRAGMENT).then(program => {
            this.program = program;
            for (const n of ["model", "view", "projection", "instanced", "billboard", "walls", "wind", "eye", "fade", "time", "swayHeight", "wallDrop", "pointSize", "colour"])
                this.u[n] = this.gl.getUniformLocation(program, n);
        });
    }

    /** Lines (and points) of one mesh. Leaves the program bound; call between other draws freely. */
    draw(view: View, mesh: WireMesh, options: WireOptions = {}) {
        if (!this.program) return;
        const gl = this.gl, u = this.u, o = options, i = o.instances;
        if (i && i.count <= 0) return;
        const edges = this.edges(mesh);
        gl.useProgram(this.program);
        this.f32.view.set(view.viewMatrix);
        this.f32.projection.set(view.projectionMatrix);
        this.f32.model.set(o.model ?? IDENTITY);
        gl.uniformMatrix4fv(u.view, false, this.f32.view);
        gl.uniformMatrix4fv(u.projection, false, this.f32.projection);
        gl.uniformMatrix4fv(u.model, false, this.f32.model);
        const e = view.worldPosition ?? { x: 0, y: 0, z: 0 };
        gl.uniform3f(u.eye, e.x, e.y, e.z);
        gl.uniform1i(u.walls, o.wallDrop !== undefined ? 1 : 0);
        gl.uniform1f(u.wallDrop, o.wallDrop ?? 0);
        gl.uniform1i(u.instanced, i ? 1 : 0);
        gl.uniform1i(u.billboard, i?.billboard ? 1 : 0);
        gl.uniform3fv(u.wind, i?.wind ?? [1, 0, 0]);
        gl.uniform2fv(u.fade, i?.fade ?? [0, 0]);
        gl.uniform1f(u.time, i?.time ?? 0);
        gl.uniform1f(u.swayHeight, i?.swayHeight ?? 1);
        gl.uniform1f(u.pointSize, this.pointSize);

        gl.bindVertexArray(mesh.vao);
        // swap in the edge list, put the mesh's own back after (a VAO keeps its element buffer)
        const own = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edges.buffer);
        if (i)
        {
            gl.bindBuffer(gl.ARRAY_BUFFER, i.buffer);
            const bytes = INSTANCE_STRIDE * 4, at = i.first * bytes;
            for (const [loc, off] of [[6, 0], [7, 16]])
            {
                gl.enableVertexAttribArray(loc);
                gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, bytes, at + off);
                gl.vertexAttribDivisor(loc, 1);
            }
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const n = i?.count ?? 1;
        gl.uniform4fv(u.colour, this.lineColour);
        gl.drawElementsInstanced(gl.LINES, edges.count, edges.type, 0, n);
        if (this.pointColour[3] > 0)
        {
            gl.uniform4fv(u.colour, this.pointColour);
            gl.drawElementsInstanced(gl.POINTS, edges.count, edges.type, 0, n);
        }
        if (i) { gl.disableVertexAttribArray(6); gl.disableVertexAttribArray(7); }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, own);
        gl.bindVertexArray(null);
    }

    destroy() {
        this.buffers.forEach(b => this.gl.deleteBuffer(b));
        this.buffers = [];
        this.cache = new WeakMap();
    }

    /** each triangle edge once */
    private edges(mesh: WireMesh): Edges {
        let e = this.cache.get(mesh.vao);
        if (e) return e;
        const idx = mesh.indices, n = idx?.length ?? mesh.count, seen = new Set<number>(), out: number[] = [];
        let top = 0;
        const at = (k: number) => idx ? idx[k] : k;
        for (let t = 0; t + 2 < n; t += 3) for (let k = 0; k < 3; k++)
        {
            const a = at(t + k), b = at(t + (k + 1) % 3), lo = Math.min(a, b), hi = Math.max(a, b), key = lo * 67108864 + hi;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(lo, hi);
            top = Math.max(top, hi);
        }
        const gl = this.gl, buffer = gl.createBuffer()!, big = top > 65535;
        // bind with no VAO so no mesh's state changes
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(out) : new Uint16Array(out), gl.STATIC_DRAW);
        this.buffers.push(buffer);
        this.cache.set(mesh.vao, e = { buffer, count: out.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT });
        return e;
    }
}
