import type { EcosystemSettings } from "@polywar/ecosystem";
import type { TerrainSettings } from "@polywar/terrain";
import type { RoadsOptions } from "@polywar/roads";
import type { SitesOptions } from "@polywar/sites";

export type Quality = "low" | "medium" | "high";

/** What makes a world: the same settings give the same world (terrain + water + nature). Plain JSON. */
export type WorldSettings = { terrain: Partial<TerrainSettings>; ecosystem: Partial<EcosystemSettings>; sites?: Partial<SitesOptions>; roads?: Partial<RoadsOptions> };

/** Per player, not part of the world: how much is drawn. */
export type WorldView = {
    /** grass and props quality presets */
    quality: Quality;
    grass: boolean;
    props: boolean;
    /** road surface strips */
    roads: boolean;
    /** grass look style */
    style: "pixel" | "smooth";
};
