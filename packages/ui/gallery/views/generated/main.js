import '@polywar/gallery';
import { MeshBuilder } from '@papit/game-mesh';

// stand-in for a generator (e.g. buildings from the village pack): items carry meshes, not files
function house(seed) {
    let s = seed;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const width = 3 + rand() * 3, depth = 3 + rand() * 3, floors = 1 + Math.floor(rand() * 3), height = floors * 2.6;
    const walls = ['#d9c9a8', '#c8b48a', '#e6dccb', '#b9a27c'][Math.floor(rand() * 4)];
    const roof = ['#8a3b2a', '#5b4636', '#6e2f25'][Math.floor(rand() * 3)];
    const b = new MeshBuilder()
        .box(walls, { at: [0, height / 2, 0], scale: [width, height, depth] })
        .cylinder(roof, { at: [0, height, 0], scale: [Math.max(width, depth) * .78, 1.6 + rand(), Math.max(width, depth) * .78], yaw: Math.PI / 4 }, 4, .5, 0)
        .box('#4a3324', { at: [0, 1, depth / 2 + .02], scale: [.9, 2, .05] });
    for (let f = 0; f < floors; f++)
        for (const x of [-width / 3, width / 3])
            b.box('#2f4a5e', { at: [x, f * 2.6 + 1.5, depth / 2 + .02], scale: [.7, .8, .05] });
    return { mesh: b.build(), note: `${floors} floor${floors > 1 ? 's' : ''}` };
}

const gallery = document.querySelector('pw-gallery');
gallery.items = [
    ...Array.from({ length: 8 }, (_, i) => ({ name: `house ${i + 1}`, group: 'generated/houses', kind: 'model', ...house(i * 7919 + 1) })),
    ...Array.from({ length: 4 }, (_, i) => ({ name: `tower ${i + 1}`, group: 'generated/towers', kind: 'model',
        mesh: new MeshBuilder().cylinder('#a49c90', { scale: [3, 8 + i * 2, 3] }, 8).cylinder('#6e2f25', { at: [0, 8 + i * 2, 0], scale: [3.6, 3, 3.6] }, 8, .5, 0).build() })),
];
