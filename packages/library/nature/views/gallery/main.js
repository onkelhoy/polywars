import '@polywar/gallery';
import { loadNature, modelUrl } from '@polywar/nature';

// every family of nature.json under its kind; variants as their own row
const list = await loadNature();
const items = [];
for (const f of list.families)
{
    const note = `${f.biomes.join(', ') || 'no biome'} · scale ${f.scale.join('-')} · slope ${f.slope} · grass ${f.grass}`;
    const rows = [['', f.models], ...Object.entries(f.variants ?? {})];
    for (const [variant, models] of rows)
        for (const m of models) items.push({ name: m, group: `${f.kind}/${f.name}${variant ? ' ' + variant : ''}`, kind: 'model', src: modelUrl(list, m), note });
}
document.querySelector('pw-gallery').items = items;
const models = new Set(items.map(i => i.name)).size;
document.querySelector('#info').textContent = `${list.families.length} families · ${models} models · missing: ${(list.missing ?? []).join(', ')}`;
