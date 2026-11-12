import type { Camera, CameraController } from "@papit/game-engine";
import { Vector3 } from "@papit/vector";

/** Where the camera looks: rotation x is pitch (up +), y is yaw, like the engine's `orbit` and `fps`. */
export function forward(yaw: number, pitch: number) {
    return new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
export function right(yaw: number) {
    return new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
}

const LIMIT = Math.PI / 2 - .01;
const clampPitch = (p: number) => Math.min(Math.max(p, -LIMIT), LIMIT);

/** true while a text field / select has focus (also inside shadow roots), so typing never moves the camera */
export function typing() {
    let a: Element | null = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    return !!a && (a.matches("input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, select") || (a as HTMLElement).isContentEditable);
}

/** the element the controllers listen on: the canvas's parent, so overlay panels next to it stay out */
const stage = (camera: Camera) => {
    const canvas = camera.surface!.element as HTMLElement;
    return (canvas.parentElement ?? canvas) as HTMLElement;
};

/**
 * Touch input the controllers read each frame (fill it from on screen controls; `@papit/joystick` fits:
 * `stick` = a `pap-joystick`, `buttons` = `pap-joystick-button`s by name). Look is a finger dragged on the canvas.
 */
export type TouchInput = {
    /** move stick, -1..1 each, y down the screen */
    stick?: { x: number; y: number };
    /** held buttons by name: walk `jump`, `run`; fly `up`, `down`, `fast` */
    buttons?: Record<string, { pressed: boolean } | undefined>;
    /** radians per dragged pixel (default .005) */
    look?: number;
};

const held = (touch: TouchInput | undefined, name: string) => touch?.buttons?.[name]?.pressed ? 1 : 0;
/** a phone / tablet: no pointer lock, touch look */
const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** one finger dragged on the canvas turns the view (touch only, so on screen controls on top stay out) */
function touchLook(canvas: HTMLElement, turn: (dx: number, dy: number) => void) {
    let id: number | null = null, x = 0, y = 0;
    const down = (e: PointerEvent) => { if (e.pointerType === "touch" && id === null) { id = e.pointerId; x = e.clientX; y = e.clientY; } };
    const move = (e: PointerEvent) => { if (e.pointerId === id) { turn(e.clientX - x, e.clientY - y); x = e.clientX; y = e.clientY; } };
    const up = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
        canvas.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
    };
}

export type FlySetting = {
    /** units per second, the wheel changes it */
    speed?: number;
    /** radians per mouse pixel */
    sensitivity?: number;
    /** on screen controls (stick moves, `up` / `down` / `fast` buttons) */
    touch?: TouchInput;
};

/**
 * Free flight. Click the view to look with the mouse (Esc lets go), or drag with the right button.
 * WASD / arrows move where the camera looks, E / space up, Q / C down, shift 4x, wheel changes speed.
 * Touch: a finger on the canvas looks, `touch` moves.
 */
export function fly(setting: FlySetting = {}): CameraController & { speed: number } {
    const sensitivity = setting.sensitivity ?? .002;
    let dx = 0, dy = 0, cleanup: (() => void) | undefined;
    const controller = {
        speed: setting.speed ?? 5,
        start(camera: Camera) {
            const canvas = camera.surface!.element as HTMLElement, element = stage(camera);
            let dragging: number | null = null;
            // inside a shadow root `document.pointerLockElement` is the host, the root node knows the canvas
            const locked = () => (canvas.getRootNode() as Document | ShadowRoot).pointerLockElement === canvas;
            const click = (e: MouseEvent) => { if (e.button === 0 && !coarse()) canvas.requestPointerLock()?.catch?.(() => { }); };
            const look = setting.touch?.look ?? .005;
            const untouch = touchLook(canvas, (x, y) => { dx += x * look / sensitivity; dy += y * look / sensitivity; });
            const down = (e: PointerEvent) => { if (e.button === 2) dragging = e.pointerId; };
            const up = (e: PointerEvent) => { if (e.pointerId === dragging) dragging = null; };
            const move = (e: MouseEvent) => {
                if (!locked() && dragging === null) return;
                dx += e.movementX; dy += e.movementY;
            };
            const wheel = (e: WheelEvent) => { e.preventDefault(); controller.speed = Math.min(Math.max(controller.speed * Math.exp(-e.deltaY * .001), .1), 1000); };
            const menu = (e: Event) => e.preventDefault();
            element.addEventListener("click", click);
            element.addEventListener("pointerdown", down);
            element.addEventListener("wheel", wheel, { passive: false });
            element.addEventListener("contextmenu", menu);
            window.addEventListener("pointerup", up);
            document.addEventListener("mousemove", move);
            cleanup = () => {
                untouch();
                element.removeEventListener("click", click);
                element.removeEventListener("pointerdown", down);
                element.removeEventListener("wheel", wheel);
                element.removeEventListener("contextmenu", menu);
                window.removeEventListener("pointerup", up);
                document.removeEventListener("mousemove", move);
                if (locked()) document.exitPointerLock();
            };
        },
        update(camera: Camera, dt: number) {
            const r = camera.rotation;
            r.y -= dx * sensitivity;
            r.x = clampPitch(r.x - dy * sensitivity);
            dx = dy = 0;
            if (typing()) return;
            const keys = camera.engine!.input.keyboard;
            const k = (...names: string[]) => names.some(n => keys.key(n)?.pressed) ? 1 : 0;
            const t = setting.touch, stick = t?.stick;
            const step = controller.speed * dt * (k("shift") || held(t, "fast") ? 4 : 1);
            const f = forward(r.y, r.x).multiply((k("w", "arrowup") - k("s", "arrowdown") - (stick?.y ?? 0)) * step);
            const s = right(r.y).multiply((k("d", "arrowright") - k("a", "arrowleft") + (stick?.x ?? 0)) * step);
            const v = (k("e", " ") + held(t, "up") - k("q", "c") - held(t, "down")) * step;
            const p = camera.position;
            p.set([p.x + f.x + s.x, p.y + f.y + s.y + v, p.z + f.z + s.z]);
        },
        destroy() { cleanup?.(); },
    };
    return controller;
}

export type PanZoomSetting = {
    /** distance to the pivot when the view doesn't look at the ground */
    distance?: number;
    min?: number;
    max?: number;
    /** radians per dragged pixel */
    sensitivity?: number;
    /** zoom per wheel pixel, as a fraction */
    speed?: number;
    /** turn around this point (the distance is the camera's to it); default where the view hits the ground */
    pivot?: [number, number, number];
    /** `ground` slides over the ground (y stays), `screen` moves in the view plane (up / down too) */
    pan?: PanMode;
};
export type PanMode = "ground" | "screen";

/**
 * Map style. Left drag turns around the pivot, right drag (or shift drag) pans (over the ground or in the view plane), wheel zooms.
 * Touch: one finger turns, two fingers pan (their middle) and pinch zoom.
 * Starts from the camera's current pose: the pivot is `pivot`, else where it looks at the ground (y = 0), or `distance` ahead.
 */
export function panZoom(setting: PanZoomSetting = {}): CameraController & { pivot: Vector3; distance: number } {
    const min = setting.min ?? .2, max = setting.max ?? 2000, sensitivity = setting.sensitivity ?? .005, speed = setting.speed ?? .0015;
    let yaw = 0, pitch = 0, cleanup: (() => void) | undefined;
    const controller = {
        pivot: new Vector3(0, 0, 0),
        distance: setting.distance ?? 10,
        start(camera: Camera) {
            const p = camera.position, r = camera.rotation;
            yaw = r.y; pitch = clampPitch(r.x);
            const f = forward(yaw, pitch);
            if (setting.pivot)
            {
                const [x, y, z] = setting.pivot;
                controller.distance = Math.min(Math.max(Math.hypot(x - p.x, y - p.y, z - p.z), min), max);
            }
            else if (f.y < -.05) controller.distance = Math.min(Math.max(-p.y / f.y, min), max);
            controller.pivot.set([p.x + f.x * controller.distance, p.y + f.y * controller.distance, p.z + f.z * controller.distance]);
            const element = stage(camera);
            let id: number | null = null, turn = false, x = 0, y = 0;
            // touch: fingers down on the stage; two = pan + pinch
            const fingers = new Map<number, { x: number; y: number }>();
            let spread = 0;
            const pair = () => {
                const [a, b] = [...fingers.values()];
                return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
            };
            const down = (e: PointerEvent) => {
                if (e.pointerType === "touch")
                {
                    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                    if (fingers.size === 2) { const m = pair(); id = -1; turn = false; x = m.x; y = m.y; spread = m.d; return; }
                    if (fingers.size > 2) return;
                }
                if (e.button !== 0 && e.button !== 2) return;
                id = e.pointerId; turn = e.button === 0 && !e.shiftKey; x = e.clientX; y = e.clientY;
            };
            const move = (e: PointerEvent) => {
                let px = e.clientX, py = e.clientY;
                if (fingers.has(e.pointerId))
                {
                    fingers.set(e.pointerId, { x: px, y: py });
                    if (fingers.size === 2)
                    {
                        const m = pair();
                        if (spread > 0 && m.d > 0) controller.distance = Math.min(Math.max(controller.distance * spread / m.d, min), max);
                        spread = m.d; px = m.x; py = m.y;
                    }
                    else if (e.pointerId !== id) return;
                }
                else if (e.pointerId !== id) return;
                const mx = px - x, my = py - y;
                x = px; y = py;
                if (turn) { yaw -= mx * sensitivity; pitch = clampPitch(pitch - my * sensitivity); return; }
                // grab the ground: the point under the pointer follows it
                const k = controller.distance * 2 * Math.tan((camera.fov || 1) / 2) / Math.max(element.clientHeight, 1);
                const s = right(yaw), q = controller.pivot;
                // ground: forward along the ground; screen: the camera's up
                const v = setting.pan === "screen"
                    ? new Vector3(Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch))
                    : new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
                q.set([q.x - s.x * mx * k + v.x * my * k, q.y + v.y * my * k, q.z - s.z * mx * k + v.z * my * k]);
            };
            const up = (e: PointerEvent) => {
                if (fingers.delete(e.pointerId))
                {
                    // back to one finger: it turns again from where it is
                    if (fingers.size === 1) { const [[k, f]] = [...fingers]; id = k; turn = true; x = f.x; y = f.y; }
                    else if (fingers.size === 0) id = null;
                    return;
                }
                if (e.pointerId === id) id = null;
            };
            const wheel = (e: WheelEvent) => { e.preventDefault(); controller.distance = Math.min(Math.max(controller.distance * Math.exp(e.deltaY * speed), min), max); };
            const menu = (e: Event) => e.preventDefault();
            element.addEventListener("pointerdown", down);
            element.addEventListener("wheel", wheel, { passive: false });
            element.addEventListener("contextmenu", menu);
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
            cleanup = () => {
                element.removeEventListener("pointerdown", down);
                element.removeEventListener("wheel", wheel);
                element.removeEventListener("contextmenu", menu);
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", up);
            };
        },
        update(camera: Camera) {
            const f = forward(yaw, pitch), q = controller.pivot, d = controller.distance;
            camera.rotation.set([pitch, yaw, 0]);
            camera.position.set([q.x - f.x * d, q.y - f.y * d, q.z - f.z * d]);
        },
        destroy() { cleanup?.(); },
    };
    return controller;
}

export type WalkSetting = {
    /** ground height at x / z (the feet stand on it) */
    ground: (x: number, z: number) => number;
    /** eye above the feet, units */
    eye?: number;
    /** walk speed, units per second; shift runs at `run` times it */
    speed?: number;
    run?: number;
    /** take off speed, units per second */
    jump?: number;
    gravity?: number;
    /** radians per mouse pixel */
    sensitivity?: number;
    /** the player let go of the view (Esc): the host switches back */
    exit?: () => void;
    /** on screen controls (stick walks, analog; `jump`, `run` buttons) */
    touch?: TouchInput;
};

/**
 * First person on foot. Click the view to look with the mouse; WASD / arrows walk where the view faces (level),
 * shift runs, space jumps, gravity pulls the feet to `ground`. Esc frees the mouse and calls `exit`.
 * Touch: a finger on the canvas looks, `touch` walks / runs / jumps (the host gives a way out, no Esc).
 * `feet` is where the walker stands (for grass pushing, sounds, ...).
 */
export function walk(setting: WalkSetting): CameraController & { feet: Vector3; grounded: boolean } {
    const sensitivity = setting.sensitivity ?? .002, eye = setting.eye ?? 1.7, speed = setting.speed ?? 4.5, run = setting.run ?? 2.2;
    const jump = setting.jump ?? 5, gravity = setting.gravity ?? 18;
    let dx = 0, dy = 0, fall = 0, vx = 0, vz = 0, cleanup: (() => void) | undefined;
    const controller = {
        feet: new Vector3(0, 0, 0),
        grounded: true,
        start(camera: Camera) {
            const canvas = camera.surface!.element as HTMLElement, element = stage(camera);
            const p = camera.position;
            controller.feet.set([p.x, setting.ground(p.x, p.z), p.z]);
            const root = () => canvas.getRootNode() as Document | ShadowRoot;
            const locked = () => root().pointerLockElement === canvas;
            let was = false;
            const lock = () => { if (!coarse()) canvas.requestPointerLock()?.catch?.(() => { }); };
            const look = setting.touch?.look ?? .005;
            const untouch = touchLook(canvas, (x, y) => { dx += x * look / sensitivity; dy += y * look / sensitivity; });
            const click = (e: MouseEvent) => { if (e.button === 0 && !locked()) lock(); };
            const move = (e: MouseEvent) => { if (locked()) { dx += e.movementX; dy += e.movementY; } };
            // Esc frees the pointer (the browser does it); losing the lock after having it is the way out
            const change = () => { if (locked()) was = true; else if (was) setting.exit?.(); };
            const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !locked() && !typing()) setting.exit?.(); };
            element.addEventListener("click", click);
            document.addEventListener("mousemove", move);
            document.addEventListener("pointerlockchange", change);
            window.addEventListener("keydown", key);
            lock();
            cleanup = () => {
                untouch();
                element.removeEventListener("click", click);
                document.removeEventListener("mousemove", move);
                document.removeEventListener("pointerlockchange", change);
                window.removeEventListener("keydown", key);
                if (locked()) document.exitPointerLock();
            };
        },
        update(camera: Camera, dt: number) {
            dt = Math.min(dt, .1);
            const r = camera.rotation;
            r.y -= dx * sensitivity;
            r.x = clampPitch(r.x - dy * sensitivity);
            dx = dy = 0;
            const keys = camera.engine!.input.keyboard;
            const k = (...names: string[]) => !typing() && names.some(n => keys.key(n)?.pressed) ? 1 : 0;
            // level forward / right, eased so starts and stops aren't instant
            const t = setting.touch, stick = t?.stick;
            const ahead = k("w", "arrowup") - k("s", "arrowdown") - (stick?.y ?? 0), side = k("d", "arrowright") - k("a", "arrowleft") + (stick?.x ?? 0);
            // keys: full speed any way; the stick is analog (a light push walks slowly)
            const l = Math.max(Math.hypot(ahead, side), 1), v = speed * (k("shift") || held(t, "run") ? run : 1);
            const fx = -Math.sin(r.y), fz = -Math.cos(r.y), rx = Math.cos(r.y), rz = -Math.sin(r.y);
            const tx = (fx * ahead + rx * side) / l * v, tz = (fz * ahead + rz * side) / l * v;
            const ease = 1 - Math.exp(-dt * (controller.grounded ? 14 : 3));
            vx += (tx - vx) * ease; vz += (tz - vz) * ease;
            const f = controller.feet;
            let x = f.x + vx * dt, z = f.z + vz * dt, y = f.y;
            if (controller.grounded && (k(" ") || held(t, "jump"))) { fall = jump; controller.grounded = false; }
            fall -= gravity * dt;
            y += fall * dt;
            const g = setting.ground(x, z);
            // walking down a slope keeps the feet on it; only a jump or a ledge leaves the ground
            if (y <= g || (controller.grounded && fall <= 0 && y - g < .6)) { y = g; fall = 0; controller.grounded = true; }
            else controller.grounded = false;
            f.set([x, y, z]);
            camera.position.set([x, y + eye, z]);
        },
        destroy() { cleanup?.(); },
    };
    return controller;
}
