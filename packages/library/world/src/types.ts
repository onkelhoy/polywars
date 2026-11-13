import type { WireMode } from "@polywar/renderer";
import type { EcosystemSettings } from "@polywar/ecosystem";
import type { TerrainSettings } from "@polywar/terrain";
import type { RoadsOptions } from "@polywar/roads";
import type { SitesOptions } from "@polywar/sites";
import type { HydrologyOptions } from "@polywar/hydrology";

export type Quality = "low" | "medium" | "high";

/** What makes a world: the same settings give the same world (terrain + water + nature). Plain JSON. */
export type WorldSettings = { terrain: Partial<TerrainSettings>; ecosystem: Partial<EcosystemSettings>; sites?: Partial<SitesOptions>; roads?: Partial<RoadsOptions>; hydrology?: Partial<HydrologyOptions> };

/** Per player, not part of the world: how much is drawn. */
export type WorldView = {
    /** grass and props quality presets */
    quality: Quality;
    grass: boolean;
    props: boolean;
    /** road surface strips */
    roads: boolean;
    /** debug river / stream lines */
    rivers: boolean;
    /** debug: a wire sphere per site (city, village, farm, landmark), sized by its radius */
    sites: boolean;
    /** grass look style */
    style: "pixel" | "smooth";
    /** debug: triangle edges and vertices of terrain and props, over the fill or alone (grass and far cards left out) */
    wire: WireMode;
};
