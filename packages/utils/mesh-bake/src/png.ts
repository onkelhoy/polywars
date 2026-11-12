const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++)
    {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc(bytes: Uint8Array) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 8 bit PNG, `channels` 1 (grey) or 3 (rgb), rows top to bottom. Works in browsers and node 18+. */
export async function encodePNG(width: number, height: number, channels: 1 | 3, pixels: Uint8Array): Promise<Uint8Array> {
    const row = width * channels, raw = new Uint8Array((row + 1) * height);
    for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * row, y * row + row), y * (row + 1) + 1);
    const head = new Uint8Array(13), view = new DataView(head.buffer);
    view.setUint32(0, width); view.setUint32(4, height); head[8] = 8; head[9] = channels === 1 ? 0 : 2;
    const chunks: [string, Uint8Array][] = [["IHDR", head], ["IDAT", await deflate(raw)], ["IEND", new Uint8Array(0)]];
    const out = new Uint8Array(8 + chunks.reduce((n, [, data]) => n + data.length + 12, 0));
    out.set([137, 80, 78, 71, 13, 10, 26, 10]);
    let offset = 8;
    for (const [type, data] of chunks)
    {
        const body = new Uint8Array(4 + data.length);
        body.set([...type].map(c => c.charCodeAt(0)));
        body.set(data, 4);
        const v = new DataView(out.buffer, offset);
        v.setUint32(0, data.length);
        out.set(body, offset + 4);
        v.setUint32(4 + body.length, crc(body));
        offset += body.length + 8;
    }
    return out;
}
