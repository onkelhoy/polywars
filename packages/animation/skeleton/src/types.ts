/** `<model>.rig.json`, written by `tools/blender/export.py` next to the .glb (glTF drops constraints). */
export type RigJSON = {
    /** Blender bone length and whether it deforms (controls don't) */
    bones: Record<string, { length: number; deform: boolean }>;
    /** IK on `bone`: its tail reaches the head of `target`, `chain` bones turn, joints bend to `pole` */
    ik: { bone: string; chain: number; target: string; pole?: string; weight: number }[];
    /** `bone` takes the world rotation of `target` (same rest orientation), after IK */
    copyRotation: { bone: string; target: string; weight: number }[];
};

/** An IK made at runtime (`Skeleton.addIK`), for rigs whose file has no controls (baked). */
export type IKControl = {
    /** the bone the IK sits on (its tail reaches the target) and how many bones turn */
    bone: string; chain: number;
    /** name of the target bone made for it */
    target: string;
    /** made bone the joints bend toward: `offset` (skin space, m) from the rest head of `near` */
    pole?: { name: string; near: string; offset: [number, number, number] };
    /** the target's parent (default: none, armature space) */
    parent?: string;
    /** this child of `bone` takes the target's rotation (hand, foot) */
    copy?: string;
};
