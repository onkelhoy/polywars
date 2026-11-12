// QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1-40, every mask
// scored. A contact link is several hundred bytes, so it needs the big versions.

export type QrMatrix = {
    /** Modules per side, without the quiet zone. */
    size: number;
    /** `size * size` entries, row by row. True is dark. */
    modules: boolean[];
};

// by version, index 0 unused
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

const MAX_VERSION = 40;
const FORMAT_LEVEL_M = 0;
const FORMAT_POLY = 0x537;
const FORMAT_MASK = 0x5412;
const VERSION_POLY = 0x1f25;
const GF_POLY = 0x11d;

// ---------------------------------------------------------------- Reed-Solomon over GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, value = 1; i < 255; i++)
{
    EXP[i] = EXP[i + 255] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= GF_POLY;
}

const times = (a: number, b: number) => a && b ? EXP[LOG[a] + LOG[b]] : 0;

function generator(degree: number): number[] {
    let poly = [1];
    for (let i = 0; i < degree; i++)
    {
        const next = new Array<number>(poly.length + 1).fill(0);
        poly.forEach((value, j) => {
            next[j] ^= value;
            next[j + 1] ^= times(value, EXP[i]);
        });
        poly = next;
    }
    return poly.slice(1);
}

function remainder(data: number[], divisor: number[]): number[] {
    const rest = new Array<number>(divisor.length).fill(0);
    for (const byte of data)
    {
        const factor = byte ^ rest.shift()!;
        rest.push(0);
        divisor.forEach((value, i) => { rest[i] ^= times(value, factor); });
    }
    return rest;
}

// ---------------------------------------------------------------- layout numbers

function rawModules(version: number): number {
    let count = (16 * version + 128) * version + 64;
    if (version >= 2)
    {
        const align = Math.floor(version / 7) + 2;
        count -= (25 * align - 10) * align - 55;
        if (version >= 7) count -= 36;
    }
    return count;
}

const totalCodewords = (version: number) => Math.floor(rawModules(version) / 8);
const dataCodewords = (version: number) => totalCodewords(version) - ECC_PER_BLOCK[version] * BLOCKS[version];
const sideOf = (version: number) => version * 4 + 17;
const countBits = (version: number) => version < 10 ? 8 : 16;

function alignmentCentres(version: number): number[] {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
    const centres = [6];
    for (let i = count - 2, at = sideOf(version) - 7; i >= 0; i--, at -= step) centres.splice(1, 0, at);
    return centres;
}

// ---------------------------------------------------------------- codewords

function pickVersion(length: number): number | null {
    for (let version = 1; version <= MAX_VERSION; version++)
    {
        const bits = 4 + countBits(version) + length * 8;
        if (bits <= dataCodewords(version) * 8) return version;
    }
    return null;
}

function encodeData(bytes: Uint8Array, version: number): number[] {
    const bits: number[] = [];
    const add = (value: number, length: number) => {
        for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };

    add(0b0100, 4);
    add(bytes.length, countBits(version));
    for (const byte of bytes) add(byte, 8);

    const capacity = dataCodewords(version) * 8;
    add(0, Math.min(4, capacity - bits.length));
    add(0, -bits.length & 7);

    const words: number[] = [];
    for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((byte, bit) => byte << 1 | bit, 0));
    for (let pad = 0xec; words.length < capacity / 8; pad ^= 0xec ^ 0x11) words.push(pad);
    return words;
}

function interleave(data: number[], version: number): number[] {
    const blockCount = BLOCKS[version];
    const eccLength = ECC_PER_BLOCK[version];
    const total = totalCodewords(version);
    const short = blockCount - total % blockCount;
    const shortData = Math.floor(total / blockCount) - eccLength;
    const divisor = generator(eccLength);

    const blocks: number[][] = [];
    const eccs: number[][] = [];
    for (let i = 0, at = 0; i < blockCount; i++)
    {
        const length = shortData + (i < short ? 0 : 1);
        const block = data.slice(at, at + length);
        at += length;
        blocks.push(block);
        eccs.push(remainder(block, divisor));
    }

    const out: number[] = [];
    for (let i = 0; i <= shortData; i++)
    {
        for (const block of blocks) if (i < block.length) out.push(block[i]);
    }
    for (let i = 0; i < eccLength; i++)
    {
        for (const ecc of eccs) out.push(ecc[i]);
    }
    return out;
}

// ---------------------------------------------------------------- the matrix

class Grid {
    modules: boolean[];
    fixed: boolean[];

    constructor(readonly size: number) {
        this.modules = new Array<boolean>(size * size).fill(false);
        this.fixed = new Array<boolean>(size * size).fill(false);
    }

    get(x: number, y: number) {
        return this.modules[y * this.size + x];
    }

    isFixed(x: number, y: number) {
        return this.fixed[y * this.size + x];
    }

    set(x: number, y: number, dark: boolean) {
        this.modules[y * this.size + x] = dark;
    }

    /** A function module: no data goes here and no mask touches it. */
    mark(x: number, y: number, dark: boolean) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
        this.set(x, y, dark);
        this.fixed[y * this.size + x] = true;
    }
}

const bit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

function bch(data: number, poly: number, bits: number): number {
    let rest = data;
    for (let i = 0; i < bits; i++) rest = (rest << 1) ^ ((rest >>> (bits - 1)) * poly);
    return rest;
}

function drawFinder(grid: Grid, cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++)
    {
        for (let dx = -4; dx <= 4; dx++)
        {
            const ring = Math.max(Math.abs(dx), Math.abs(dy));
            grid.mark(cx + dx, cy + dy, ring !== 2 && ring !== 4);
        }
    }
}

function drawFormat(grid: Grid, mask: number) {
    const data = FORMAT_LEVEL_M << 3 | mask;
    const bits = (data << 10 | bch(data, FORMAT_POLY, 10)) ^ FORMAT_MASK;
    const size = grid.size;

    for (let i = 0; i <= 5; i++) grid.mark(8, i, bit(bits, i));
    grid.mark(8, 7, bit(bits, 6));
    grid.mark(8, 8, bit(bits, 7));
    grid.mark(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) grid.mark(14 - i, 8, bit(bits, i));

    for (let i = 0; i < 8; i++) grid.mark(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) grid.mark(8, size - 15 + i, bit(bits, i));
    grid.mark(8, size - 8, true);
}

function drawVersion(grid: Grid, version: number) {
    if (version < 7) return;
    const bits = version << 12 | bch(version, VERSION_POLY, 12);
    for (let i = 0; i < 18; i++)
    {
        const a = grid.size - 11 + i % 3;
        const b = Math.floor(i / 3);
        grid.mark(a, b, bit(bits, i));
        grid.mark(b, a, bit(bits, i));
    }
}

function drawFunctions(grid: Grid, version: number) {
    const size = grid.size;
    for (let i = 0; i < size; i++)
    {
        grid.mark(6, i, i % 2 === 0);
        grid.mark(i, 6, i % 2 === 0);
    }

    drawFinder(grid, 3, 3);
    drawFinder(grid, size - 4, 3);
    drawFinder(grid, 3, size - 4);

    const centres = alignmentCentres(version);
    const last = centres.length - 1;
    centres.forEach((cy, row) => centres.forEach((cx, column) => {
        const onFinder = (row === 0 && column === 0) || (row === 0 && column === last) || (row === last && column === 0);
        if (onFinder) return;
        for (let dy = -2; dy <= 2; dy++)
        {
            for (let dx = -2; dx <= 2; dx++) grid.mark(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }));

    drawFormat(grid, 0);
    drawVersion(grid, version);
}

function drawCodewords(grid: Grid, codewords: number[]) {
    const size = grid.size;
    let index = 0;
    for (let right = size - 1; right >= 1; right -= 2)
    {
        if (right === 6) right = 5;
        for (let step = 0; step < size; step++)
        {
            for (let side = 0; side < 2; side++)
            {
                const x = right - side;
                const upward = ((right + 1) & 2) === 0;
                const y = upward ? size - 1 - step : step;
                if (grid.isFixed(x, y) || index >= codewords.length * 8) continue;
                grid.set(x, y, bit(codewords[index >>> 3], 7 - (index & 7)));
                index++;
            }
        }
    }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
];

// a mask is its own inverse: the same call takes it off again
function applyMask(grid: Grid, mask: number) {
    for (let y = 0; y < grid.size; y++)
    {
        for (let x = 0; x < grid.size; x++)
        {
            if (!grid.isFixed(x, y) && MASKS[mask](x, y)) grid.set(x, y, !grid.get(x, y));
        }
    }
}

const FINDER_LIKE = [[true, false, true, true, true, false, true, false, false, false, false], [false, false, false, false, true, false, true, true, true, false, true]];

function lineScore(line: boolean[]): number {
    let score = 0;
    let run = 0;
    line.forEach((dark, i) => {
        run = i > 0 && dark === line[i - 1] ? run + 1 : 1;
        if (run === 5) score += 3;
        else if (run > 5) score += 1;
        if (FINDER_LIKE.some(pattern => pattern.every((want, j) => line[i + j] === want))) score += 40;
    });
    return score;
}

function penalty(grid: Grid): number {
    const size = grid.size;
    let score = 0;
    let dark = 0;

    for (let i = 0; i < size; i++)
    {
        const row: boolean[] = [];
        const column: boolean[] = [];
        for (let j = 0; j < size; j++)
        {
            row.push(grid.get(j, i));
            column.push(grid.get(i, j));
        }
        score += lineScore(row) + lineScore(column);
    }
    for (let y = 0; y < size; y++)
    {
        for (let x = 0; x < size; x++)
        {
            if (grid.get(x, y)) dark++;
            if (x === size - 1 || y === size - 1) continue;
            const value = grid.get(x, y);
            if (value === grid.get(x + 1, y) && value === grid.get(x, y + 1) && value === grid.get(x + 1, y + 1)) score += 3;
        }
    }

    const percent = dark * 100 / (size * size);
    return score + Math.floor(Math.abs(percent - 50) / 5) * 10;
}

/** The QR code of `text`, or null when it doesn't fit a version 40 code (2331 bytes). */
export function encodeQr(text: string): QrMatrix | null {
    const bytes = new TextEncoder().encode(text);
    const version = pickVersion(bytes.length);
    if (version === null) return null;

    const grid = new Grid(sideOf(version));
    drawFunctions(grid, version);
    drawCodewords(grid, interleave(encodeData(bytes, version), version));

    let best = 0;
    let lowest = Infinity;
    for (let mask = 0; mask < MASKS.length; mask++)
    {
        applyMask(grid, mask);
        drawFormat(grid, mask);
        const score = penalty(grid);
        if (score < lowest)
        {
            lowest = score;
            best = mask;
        }
        applyMask(grid, mask);
    }

    applyMask(grid, best);
    drawFormat(grid, best);
    return { size: grid.size, modules: grid.modules };
}
