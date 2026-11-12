import type { Armature, Bone } from "@papit/armature";

/** What the gizmo draws: an armature, plus what a rig knows about it (`@polywar/skeleton`'s `Skeleton` fits). */
export type RigView = {
    armature: Armature;
    /** bones that move the mesh; the others are drawn as controls. Missing = all deform. */
    deform?: Set<Bone>;
    /** bones that copy another bone's rotation */
    copies?: { bone: Bone; target: Bone }[];
};

export type RGBA = [number, number, number, number];

export type GizmoOptions = {
    /** draw over the mesh like Blender's "In Front" (default true) */
    inFront?: boolean;
    /** bone outlines, parent lines and IK lines (default true) */
    lines?: boolean;
    /** bones drawn brighter */
    selected?: Set<Bone>;
    /** bone body size relative to Blender's (default 1) */
    scale?: number;
};

export type GizmoColors = {
    bone: RGBA; wire: RGBA; joint: RGBA;
    /** bone carrying an IK constraint, and the bones its chain turns */
    ik: RGBA; chain: RGBA;
    copy: RGBA;
    /** IK target / pole controls and their dashed links */
    target: RGBA; pole: RGBA;
    control: RGBA;
    parent: RGBA;
    selected: RGBA;
};
