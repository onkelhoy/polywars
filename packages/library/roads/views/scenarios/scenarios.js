// Small test worlds: ground height + water, sites, links (class, a, b). Size 600 m, cell 4 m.
export const SIZE = 600, N = 151;

const flat = () => 20;
const site = (id, x, z, kind = 'village') => ({ id, kind, x, z, y: 0, radius: 20, weight: 1 });
const river = (x, z) => Math.abs(z - 40 * Math.sin(x / 90)) < 10;
const hill = (x) => 20 + Math.max(0, 80 - Math.abs(x) * .7);
const valley = (x) => 20 + Math.min(1, Math.abs(x) / 60) * 45;

export const SCENARIOS = [
    { name: 'T junction', zoom: 3, height: flat, sites: [site(0, -250, 0), site(1, 250, 0), site(2, 0, 250), site(3, 0, 0, 'farm')], links: [['road', 0, 1], ['road', 2, 3]] },
    { name: 'X crossing', zoom: 3, height: flat, sites: [site(0, -250, 0), site(1, 250, 0), site(2, 0, -250), site(3, 0, 250)], links: [['road', 0, 1], ['road', 2, 3]] },
    { name: 'Y angled', zoom: 2, height: flat, sites: [site(0, -250, 100), site(1, 250, 100), site(2, 0, -250)], links: [['road', 0, 1], ['road', 2, 1], ['lane', 2, 0]] },
    { name: 'road + path beside', height: flat, sites: [site(0, -250, 0, 'city'), site(1, 250, 0), site(2, 200, 150, 'viewpoint')], links: [['road', 0, 1], ['path', 0, 2]] },
    { name: 'road / rail crossing', height: flat, sites: [site(0, -250, -50, 'city'), site(1, 250, 50, 'city'), site(2, 0, -250), site(3, 0, 250)], links: [['rail', 0, 1], ['road', 2, 3]] },
    { name: 'rail over road (valley)', height: valley, sites: [site(0, -250, 0, 'city'), site(1, 250, 0, 'city'), site(2, 0, -250), site(3, 0, 250)], links: [['rail', 0, 1], ['road', 2, 3]] },
    { name: 'rail switch', height: flat, sites: [site(0, -250, -150, 'city'), site(1, 250, 0, 'city'), site(2, -250, 150, 'city')], links: [['rail', 0, 1], ['rail', 2, 1]] },
    { name: 'bridge over river', height: flat, water: river, sites: [site(0, 0, -250), site(1, 30, 250), site(2, -250, -200)], links: [['road', 0, 1], ['path', 2, 1]] },
    { name: 'tunnel through hill', height: hill, sites: [site(0, -280, 0, 'city'), site(1, 280, 0, 'city')], links: [['rail', 0, 1]] },
];

/** a `Ground` for `@polywar/roads` from a scenario */
export function ground(sc) {
    const height = new Float32Array(N * N), water = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
    {
        const x = (i / (N - 1) - .5) * SIZE, z = (j / (N - 1) - .5) * SIZE, k = j * N + i;
        height[k] = sc.height(x, z);
        if (sc.water?.(x, z)) { water[k] = 3; height[k] -= 3; }
    }
    return { n: N, cell: SIZE / (N - 1), size: SIZE, height, seaLevel: 0, water };
}
