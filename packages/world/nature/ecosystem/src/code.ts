/**
 * Share codes: settings as a short url safe string. Only what differs from `base` is stored,
 * numbers are rounded to 4 decimals, so untouched settings are just the version (`g1`).
 * The version prefix keeps old codes loading when the defaults change: bump it and keep the old base.
 */
const VERSION = "e1";
/** older versions: the base they were made against, as changes to the current base */
const OLD: Record<string, Record<string, unknown>> = {};

type Data = unknown;
const isObject = (v: Data): v is Record<string, Data> => typeof v === "object" && v !== null && !Array.isArray(v);
const round = (v: Data): Data => typeof v === "number" ? Math.round(v * 1e4) / 1e4
    : Array.isArray(v) ? v.map(round)
    : isObject(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v;

/** flat `path: value` of what in `value` differs from `base`; objects and same length arrays go deeper */
function diff(value: Data, base: Data, path = "", out: Record<string, Data> = {}) {
    value = round(value);
    if (JSON.stringify(value) === JSON.stringify(round(base))) return out;
    const deeper = Array.isArray(value) ? Array.isArray(base) && value.length === base.length : isObject(value) && isObject(base);
    if (!deeper) out[path] = value;
    else for (const k of Object.keys(value as object)) diff((value as any)[k], (base as any)[k], path ? `${path}.${k}` : k, out);
    return out;
}

/** `base` with the flat changes applied */
function patch<T>(base: T, changes: Record<string, Data>): T {
    const out: any = structuredClone(base);
    for (const [path, v] of Object.entries(changes))
    {
        const keys = path.split("."), last = keys.pop()!;
        let o = out;
        for (const k of keys) o = o[k] ??= {};
        o[last] = v;
    }
    return out;
}

const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64 = (code: string) => new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)));

/** `settings` as a code against `base` */
export function encode(settings: object, base: object): string {
    const d = diff(settings, base);
    return Object.keys(d).length ? `${VERSION}.${toBase64(JSON.stringify(d))}` : VERSION;
}

/** true when `text` looks like a share code */
export const isCode = (text: string) => /^e\d+(\.[\w-]+)?$/.test(text.trim());

/** settings from a code made against `base` */
export function decode<T extends object>(code: string, base: T): T {
    const [version, payload] = code.trim().split(".");
    if (version !== VERSION && !OLD[version]) throw new Error(`unknown ecosystem code version "${version}"`);
    const from = version === VERSION ? base : patch(base, OLD[version]);
    return payload ? patch(from, JSON.parse(fromBase64(payload))) : structuredClone(from);
}
