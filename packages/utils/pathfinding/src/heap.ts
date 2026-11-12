/** Binary min heap of (key, value) on typed arrays: no objects per push, grows when full. */
export class Heap {
    private keys: Float64Array;
    private values: Int32Array;
    size = 0;

    constructor(capacity = 1024) {
        this.keys = new Float64Array(capacity);
        this.values = new Int32Array(capacity);
    }

    clear() { this.size = 0; }

    push(key: number, value: number) {
        if (this.size === this.keys.length)
        {
            const k = new Float64Array(this.size * 2), v = new Int32Array(this.size * 2);
            k.set(this.keys); v.set(this.values);
            this.keys = k; this.values = v;
        }
        const { keys, values } = this;
        let i = this.size++;
        while (i > 0)
        {
            const p = (i - 1) >> 1;
            if (keys[p] <= key) break;
            keys[i] = keys[p]; values[i] = values[p]; i = p;
        }
        keys[i] = key; values[i] = value;
    }

    /** key of the top, Infinity when empty */
    peek() { return this.size ? this.keys[0] : Infinity; }

    /** value of the smallest key (heap must not be empty) */
    pop(): number {
        const { keys, values } = this, top = values[0], n = --this.size;
        if (n === 0) return top;
        const key = keys[n], value = values[n];
        let i = 0;
        for (; ;)
        {
            let c = 2 * i + 1;
            if (c >= n) break;
            if (c + 1 < n && keys[c + 1] < keys[c]) c++;
            if (keys[c] >= key) break;
            keys[i] = keys[c]; values[i] = values[c]; i = c;
        }
        keys[i] = key; values[i] = value;
        return top;
    }
}
