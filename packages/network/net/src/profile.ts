import type { Profile } from "@papit/game-network";

const KEY = "polywar:profile";

/** The player's profile, kept in `localStorage` across visits. A fresh one gets a random name. */
export function loadProfile(storage: Storage | null = safeLocal()): Profile {
    try
    {
        const saved = JSON.parse(storage?.getItem(KEY) ?? "null");
        if (saved && typeof saved === "object" && typeof saved.name === "string") return saved;
    }
    catch { /* broken entry: start fresh */ }
    const fresh = { name: `Soldier ${Math.floor(100 + Math.random() * 900)}` };
    saveProfile(fresh, storage);
    return fresh;
}

export function saveProfile(profile: Profile, storage: Storage | null = safeLocal()) {
    try { storage?.setItem(KEY, JSON.stringify(profile)); }
    catch { /* private mode, full: fine */ }
}

function safeLocal() {
    try { return typeof localStorage === "undefined" ? null : localStorage; }
    catch { return null; }
}
