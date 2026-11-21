import '@polywar/viewport';
import { Renderer } from '@polywar/renderer';
import { loadNature } from '@polywar/nature-assets';
import { MAPS } from '@polywar/terrain';
import { linear } from '@polywar/terrain-material';
import { WaterScreen } from '@polywar/water';
import { World } from '@polywar/world';

// one farm on a very small real world: terrain, grass, rocks, trees, the farm in the middle
const $ = s => document.querySelector(s);
const demo = $('pw-viewport');
await demo.ready;
const layer = demo.layer;
const renderer = new Renderer(layer);
renderer.light.fogDensity = .0008;
renderer.light.fogColor = linear('#a9bfd3');
renderer.light.sunDirection = [.45, .64, .62];
const waterScreen = new WaterScreen(layer);
const nature = await loadNature();
const base = MAPS['small island'];
const NO_FARM_SITES = { perTown: 0, perVillage: 0, near: [1.5, 4], radius: 18, maxSlope: .2 };
const settings = () => ({
    terrain: { ...base, seed: +$('#tseed').value, size: 640, height: +$('#height').value, quality: 'low', edge: MAPS.inland.edge, sea: .05, cities: { ...base.cities, count: 1, spacing: 400 } },
    ecosystem: {},
    sites: { farm: NO_FARM_SITES },
    farms: [{ x: 0, z: 0, radius: +$('#radius').value }],
});
let world = new World(layer, renderer, nature, settings(), { quality: $('#quality').value });
window.world = world;
let t0 = performance.now();
world.onchange = () => {
    const f = world.farms[0]?.layout;
    $('#info').value = `grown ${((performance.now() - t0) | 0)} ms\n` + (f ? `buildings ${f.buildings.length}, props ${f.props.length}\nfields ${f.fields.map(x => x.crop[0]).join('')}, trees ${f.trees.length}\npastures ${f.pastures.map(p => p.animal).join(' ')}` : 'no farm');
};
const rebuild = () => { world.destroy(); t0 = performance.now(); world = new World(layer, renderer, nature, settings(), { quality: $('#quality').value }); window.world = world; world.onchange = onchange; };
const onchange = world.onchange;
for (const id of ['#tseed', '#height', '#radius']) $(id).onchange = rebuild;
$('#quality').onchange = e => world.setView({ quality: e.target.value });

const at = (x, z) => world.heightAt(x, z);
$('#top').onclick = () => demo.look([0, at(0, 0) + 260, 1], [0, at(0, 0), 0]);
$('#yard').onclick = () => { const c = world.farms[0]?.layout.court; if (c) demo.look([c.x + 30, at(c.x, c.z) + 14, c.z + 30], [c.x, at(c.x, c.z) + 2, c.z]); };
$('#bench').onclick = () => {
    const v = world.farms[0]?.layout.view; if (!v) return;
    const y = at(v.x, v.z) + 1.4;
    demo.look([v.x - Math.cos(v.yaw) * 3, y + .6, v.z - Math.sin(v.yaw) * 3], [v.x + Math.cos(v.yaw) * 40, y - 6, v.z + Math.sin(v.yaw) * 40]);
};

demo.draw = camera => {
    const t = world.terrain, under = camera.worldPosition && t.underwater(camera.worldPosition);
    renderer.begin(camera, under ? [...linear(t.water.look.under.shallow).map(c => Math.pow(c, 1 / 2.2)), 1] : [...renderer.light.fogColor.map(c => Math.pow(c, 1 / 2.2)), 1]);
    world.draw(camera, renderer.light, demo.time);
    waterScreen.draw(!!under, demo.time, t.water.look.under.shallow);
};
demo.look([-170, 110, 170], [0, 0, 0]);
