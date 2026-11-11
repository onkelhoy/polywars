import type { Random } from "@papit/random";
import type { Ctx } from "../core";
import type { Settings } from "../types";
import { braces } from "./braces";
import { chimney } from "./chimney";
import { dormer } from "./dormer";
import { gableWindow } from "./gable";
import { jetty } from "./jetty";

/** one house feature: `key` = its setting (none = always), `plan` runs before walls/roof, `build` after */
export type Feature = {
    name: string;
    key?: keyof Settings;
    /** false = the house can't take it (too small, ...), reported as off */
    fits?(ctx: Ctx): boolean;
    plan?(ctx: Ctx, rng: Random): void;
    build?(ctx: Ctx, rng: Random): void;
};

export const FEATURES: Feature[] = [jetty, gableWindow, dormer, chimney, braces];
