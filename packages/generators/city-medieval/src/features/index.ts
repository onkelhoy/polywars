import type { Random } from "@papit/random";
import type { Ctx } from "../core";
import type { Settings } from "../types";
import { awning } from "./awning";
import { balcony } from "./balcony";
import { braces } from "./braces";
import { chimney } from "./chimney";
import { dormer } from "./dormer";
import { gableWindow } from "./gable";
import { ground } from "./ground";
import { jetty } from "./jetty";
import { props } from "./props";
import { tunnel } from "./tunnel";
import { waterwheel } from "./waterwheel";
import { windmill } from "./windmill";

/** one house feature: `key` = its setting (none = always), `plan` runs before walls/roof, `build` after */
export type Feature = {
    name: string;
    key?: keyof Settings;
    /** false = the house can't take it (too small, ...), reported as off */
    fits?(ctx: Ctx): boolean;
    plan?(ctx: Ctx, rng: Random): void;
    build?(ctx: Ctx, rng: Random): void;
};

export const FEATURES: Feature[] = [tunnel, windmill, jetty, balcony, gableWindow, dormer, chimney, braces, waterwheel, awning, props, ground];
