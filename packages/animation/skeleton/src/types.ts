/** `<model>.rig.json`, written by `tools/blender/export.py` next to the .glb (glTF drops constraints). */
export type RigJSON = {
    /** Blender bone length and whether it deforms (controls don't) */
    bones: Record<string, { length: number; deform: boolean }>;
    /** IK on `bone`: its tail reaches the head of `target`, `chain` bones turn, joints bend to `pole` */
    ik: { bone: string; chain: number; target: string; pole?: string; weight: number }[];
    /** `bone` takes the world rotation of `target` (same rest orientation), after IK */
    copyRotation: { bone: string; target: string; weight: number }[];
};
