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

export type FlySetting = {
    /** units per second, the wheel changes it */
    speed?: number;
    /** radians per mouse pixel */
    sensitivity?: number;
};

/**
 * Free flight. Click the view to look with the mouse (Esc lets go), or drag with the right button.
 * WASD / arrows move where the camera looks, E / space up, Q / C down, shift 4x, wheel changes speed.
 */
export function fly(setting: FlySetting = {}): CameraController & { speed: number } {
    const sensitivity = setting.sensitivity ?? .002;
    let dx = 0, dy = 0, cleanup: (() => void) | undefined;
    const controller = {
        speed: setting.speed ?? 5,
        start(camera: Camera) {
            const canvas = camera.surface!.element as HTMLElement, element = stage(camera);
            let dragging: number | null = null;
            const click = (e: MouseEvent) => { if (e.button === 0) canvas.requestPointerLock()?.catch?.(() => { }); };
            const down = (e: PointerEvent) => { if (e.button === 2) dragging = e.pointerId; };
            const up = (e: PointerEvent) => { if (e.pointerId === dragging) dragging = null; };
            const move = (e: MouseEvent) => {
                if (document.pointerLockElement !== canvas && dragging === null) return;
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
                element.removeEventListener("click", click);
                element.removeEventListener("pointerdown", down);
                element.removeEventListener("wheel", wheel);
                element.removeEventListener("contextmenu", menu);
                window.removeEventListener("pointerup", up);
                document.removeEventListener("mousemove", move);
                if (document.pointerLockElement === canvas) document.exitPointerLock();
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
            const step = controller.speed * dt * (k("shift") ? 4 : 1);
            const f = forward(r.y, r.x).multiply((k("w", "arrowup") - k("s", "arrowdown")) * step);
            const s = right(r.y).multiply((k("d", "arrowright") - k("a", "arrowleft")) * step);
            const v = (k("e", " ") - k("q", "c")) * step;
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
};

/**
 * Map style. Left drag pans over the ground, right drag (or shift drag) turns around the pivot, wheel zooms.
 * Starts from the camera's current pose: the pivot is where it looks at the ground (y = 0), or `distance` ahead.
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
            if (f.y < -.05) controller.distance = Math.min(Math.max(-p.y / f.y, min), max);
            controller.pivot.set([p.x + f.x * controller.distance, p.y + f.y * controller.distance, p.z + f.z * controller.distance]);
            const element = stage(camera);
            let id: number | null = null, turn = false, x = 0, y = 0;
            const down = (e: PointerEvent) => {
                if (e.button !== 0 && e.button !== 2) return;
                id = e.pointerId; turn = e.button === 2 || e.shiftKey; x = e.clientX; y = e.clientY;
            };
            const move = (e: PointerEvent) => {
                if (e.pointerId !== id) return;
                const mx = e.clientX - x, my = e.clientY - y;
                x = e.clientX; y = e.clientY;
                if (turn) { yaw -= mx * sensitivity; pitch = clampPitch(pitch - my * sensitivity); return; }
                // grab the ground: the point under the pointer follows it
                const k = controller.distance * 2 * Math.tan((camera.fov || 1) / 2) / Math.max(element.clientHeight, 1);
                const s = right(yaw), ahead = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
                const q = controller.pivot;
                q.set([q.x - s.x * mx * k + ahead.x * my * k, q.y, q.z - s.z * mx * k + ahead.z * my * k]);
            };
            const up = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
            const wheel = (e: WheelEvent) => { e.preventDefault(); controller.distance = Math.min(Math.max(controller.distance * Math.exp(e.deltaY * speed), min), max); };
            const menu = (e: Event) => e.preventDefault();
            element.addEventListener("pointerdown", down);
            element.addEventListener("wheel", wheel, { passive: false });
            element.addEventListener("contextmenu", menu);
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            cleanup = () => {
                element.removeEventListener("pointerdown", down);
                element.removeEventListener("wheel", wheel);
                element.removeEventListener("contextmenu", menu);
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
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
