import type { Action, GunSpec, Timeline } from "./types";

/** after a shot, through `interval`: hand worked actions open (the case flies) and close, self loaders throw it at once */
const CYCLE: Record<Action, Timeline> = {
    "bolt": [[.3, "bolt-open"], [.33, "eject"], [.7, "bolt-close"]],
    "straight-pull": [[.25, "bolt-open"], [.28, "eject"], [.6, "bolt-close"]],
    "lever": [[.25, "bolt-open"], [.28, "eject"], [.6, "bolt-close"]],
    "semi": [[0, "eject"]],
    "auto": [[0, "eject"]],
    "pistol": [[0, "eject"]],
    "break": [],
};

/** single rounds through a gate or tube (lever, the long bolt reloads): one `round-in` each, spread over the middle */
function rounds(count: number, from: number, to: number): Timeline {
    const n = Math.max(1, Math.min(count, 8));
    return Array.from({ length: n }, (_, i) => [from + (to - from) * (n === 1 ? .5 : i / (n - 1)), "round-in"]);
}

/**
 * The reload's cues for `spec` (`empty`: the gun ran dry), `missing` rounds to put in.
 * Magazines: out, in, (empty) the slide. Bolts: open, a stripper clip (or single rounds for slow tube loaders), close.
 */
export function reloadCues(spec: GunSpec, action: Action, empty: boolean, missing: number): Timeline {
    const own = empty ? spec.cues?.reloadEmpty ?? spec.cues?.reload : spec.cues?.reload;
    if (own) return own;
    switch (action)
    {
        case "semi": case "auto": case "pistol":
            return empty ? [[.15, "mag-out"], [.55, "mag-in"], [.85, "slide"]] : [[.2, "mag-out"], [.65, "mag-in"]];
        case "bolt": case "straight-pull":
            // the long reloads (tube magazines) go a round at a time
            if (spec.reload >= 4) return [[.06, "bolt-open"], ...rounds(missing, .15, .85), [.93, "bolt-close"]];
            return [[.1, "bolt-open"], [.4, "clip-in"], [.82, "bolt-close"]];
        case "lever":
            return empty ? [...rounds(missing, .08, .7), [.8, "bolt-open"], [.9, "bolt-close"]] : rounds(missing, .1, .9);
        case "break":
            return [[.1, "bolt-open"], ...Array.from({ length: Math.max(1, missing) }, (): [number, "eject"] => [.16, "eject"]), ...rounds(missing, .4, .6), [.85, "bolt-close"]];
    }
}

/** cues after a shot */
export function cycleCues(spec: GunSpec, action: Action): Timeline {
    return spec.cues?.cycle ?? CYCLE[action];
}

/** the action a spec works by */
export function actionOf(spec: GunSpec): Action {
    return spec.action ?? (spec.kind === "pistol" ? "pistol" : spec.auto ? "auto" : "semi");
}
