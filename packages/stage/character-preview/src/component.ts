// system
import { CustomElement, html, property } from "@papit/web-component";
import "@polywar/3d-asset-preview";
import type { AssetPreview3D, LoadEvent } from "@polywar/3d-asset-preview";
import type { Model, Renderer } from "@polywar/renderer";
import type { Matrix4 } from "@papit/matrix";
import { Skeleton } from "@polywar/skeleton";
import { RigGizmo } from "@polywar/rig-gizmo";
import "@papit/button";

// local
import sheet from "./style.css" with { type: "css" };

/**
 * A character by path (`model.glb` with `model.rig.json`): `pw-3d-asset-preview` (orbit, clips, frames)
 * posed by `@polywar/skeleton` (IK) with Blender style bones from `@polywar/rig-gizmo` on top.
 * Toggles: mesh, bones, in front, IK.
 */
export class CharacterPreview extends CustomElement {
    static sheet = sheet;

    @property({ after: function (this: CharacterPreview) { this.sync(); } }) src: string = "";
    @property({ after: function (this: CharacterPreview) { this.sync(); } }) animation: string = "idle";
    @property({ after: function (this: CharacterPreview) { this.sync(); } }) mode: string = "orbit";
    @property({ type: Boolean, rerender: true }) mesh: boolean = true;
    @property({ type: Boolean, rerender: true }) bones: boolean = true;
    @property({ type: Boolean, rerender: true, attribute: "in-front" }) inFront: boolean = true;
    @property({ type: Boolean, rerender: true }) ik: boolean = true;

    private gizmo?: RigGizmo;
    private info = "";

    /** made once outside the template, so re-renders (toggles) never replace it */
    preview?: AssetPreview3D;

    firstRender() {
        super.firstRender();
        const preview = this.preview = document.createElement("pw-3d-asset-preview") as AssetPreview3D;
        preview.setAttribute("controls", "");
        preview.setAttribute("grid", "");
        preview.setAttribute("keep-view", "");
        preview.setAttribute("part", "preview");
        this.shadowRoot!.prepend(preview);
        preview.skin = Skeleton.skin;
        preview.overlay = this.overlay;
        preview.addEventListener("load", e => {
            const skin = preview.model?.skin;
            const { triangles } = (e as CustomEvent<LoadEvent>).detail;
            this.info = skin instanceof Skeleton
                ? `${skin.armature.bones.length} bones · ${skin.deform.size} deform · ${skin.ik.size} IK · ${Math.round(triangles)} tris`
                : `${Math.round(triangles)} tris`;
            this.requestUpdate();
        });
        this.sync();
    }

    /** attributes through to the preview (skin first, so the first load uses it) */
    private sync() {
        const preview = this.preview;
        if (!preview || !this.src || this.src.includes("__marker__")) return;
        preview.mode = this.mode as AssetPreview3D["mode"];
        if (this.animation && !this.animation.includes("__marker__")) preview.animation = this.animation;
        if (preview.src !== this.src) preview.src = this.src;
    }

    private overlay = (renderer: Renderer, model: Model, matrix: Matrix4) => {
        const skin = model.skin;
        if (!(skin instanceof Skeleton)) return;
        if (skin.ikEnabled !== this.ik) skin.ikEnabled = this.ik;
        if (this.preview) this.preview.hideModel = !this.mesh;
        if (!this.bones) return;
        this.gizmo ??= new RigGizmo(renderer.gl);
        this.gizmo.draw(renderer, skin, matrix.clone.multiply(model.skeletonMatrix), { inFront: this.inFront });
    };

    private toggle = (name: "mesh" | "bones" | "inFront" | "ik") => () => { this[name] = !this[name]; };

    render() {
        const button = (name: "mesh" | "bones" | "inFront" | "ik", label: string) =>
            html`<pap-button size="small" variant="${this[name] ? "filled" : "outline"}" @click="${this.toggle(name)}">${label}</pap-button>`;
        return html`
            <div class="toggles" part="toggles">
                ${button("mesh", "mesh")}
                ${button("bones", "bones")}
                ${button("inFront", "in front")}
                ${button("ik", "IK")}
                <small>${this.info}</small>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pw-character-preview": CharacterPreview;
    }
}
