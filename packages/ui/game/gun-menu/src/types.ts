/** One gun in the menu. `image`: a thumbnail url / data url (e.g. `@polywar/renderer` `thumbnail`), none = name only. */
export type GunMenuItem = { id: string; name: string; kind?: string; image?: string };

export type PickEvent = { index: number; item: GunMenuItem };
