// scenarios headless: roads per scenario (`node tools/audit-ways.mjs scen`)
import { Roads } from "@polywar/roads";
// @ts-ignore
import { SCENARIOS, ground } from "../../packages/library/roads/views/scenarios/scenarios.js";
for (const sc of SCENARIOS)
{
    const g = ground(sc), roads = new Roads(g, { cell: 4 }), byId = new Map(sc.sites.map((s: any) => [s.id, s]));
    const net = roads.build(sc.sites, sc.links.map(([cls, a, b]: any) => ({ cls, a: byId.get(a), b: byId.get(b) })));
    console.log(sc.name + ": " + net.roads.map(r => `${r.class}#${r.id} ${r.from}→${r.to} ${r.spans.map(s => s.kind[0] + (s.to - s.from)).join(" ")} [${[r.points[0], r.points[r.points.length - 1]].map(p => p.map(v => v.toFixed(0)).join(",")).join(" → ")}]`).join(" | "));
}
if (process.env.SC)
{
    const sc = SCENARIOS.find((s: any) => s.name.startsWith(process.env.SC!)), g = ground(sc), roads = new Roads(g, { cell: 4 }), byId = new Map(sc.sites.map((s: any) => [s.id, s]));
    const net = roads.build(sc.sites, sc.links.map(([cls, a, b]: any) => ({ cls, a: byId.get(a), b: byId.get(b) })));
    for (const r of net.roads) console.log(r.class, JSON.stringify(r.spans), r.points.filter((_, i) => i % 4 === 0).map(p => p.map(v => v.toFixed(0)).join(",")).join(" "));
}
