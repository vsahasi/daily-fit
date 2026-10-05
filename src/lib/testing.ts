import type { Item } from "@prisma/client";

/** Builds a full closet Item for unit tests. Only id, category, and name are required. */
export function testItem(over: Partial<Item> & { id: string; category: string; name: string }): Item {
  return {
    userId: "u1",
    createdAt: new Date(0),
    imagePath: `u1/items/${over.id}.jpg`,
    subcategory: null,
    colors: '["navy"]',
    material: null,
    pattern: null,
    formality: 2,
    warmth: 2,
    rainOk: true,
    notes: null,
    fit: null,
    silhouette: null,
    layerRole: null,
    colorFamilies: '["navy"]',
    pairsWith: "[]",
    avoidWith: "[]",
    profile: null,
    washDays: null,
    status: "available",
    washUntil: null,
    lastWornAt: null,
    source: "web",
    ...over,
  };
}
