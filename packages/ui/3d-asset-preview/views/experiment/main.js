// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@polywar/3d-asset-preview';

window.onload = () => {
    console.log('[demo]: window loaded');

    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");
}

