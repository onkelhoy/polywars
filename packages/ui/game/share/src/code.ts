/** No 0/O, 1/I/L, as `@papit/game-network` makes them. */
const LETTERS = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** The game code in a scanned text: an invite link (`?g=K7QF2M`) or the bare code. Null when neither. */
export function codeOf(text: string, param = "g"): string | null {
    const trimmed = text.trim();
    let candidate = trimmed;
    try
    {
        const url = new URL(trimmed);
        candidate = url.searchParams.get(param) ?? "";
    }
    catch { /* not a link */ }
    const code = candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return LETTERS.test(code) ? code : null;
}
