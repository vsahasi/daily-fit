import type { Item } from "@prisma/client";

const NEUTRALS = new Set([
  "white",
  "cream",
  "ivory",
  "grey",
  "gray",
  "black",
  "charcoal",
  "navy",
  "khaki",
  "beige",
  "tan",
  "sand",
  "stone",
  "oatmeal",
  "brown",
  "olive",
  "blue",
]);

const hayCache = new WeakMap<Item, string>();
const familyCache = new WeakMap<Item, string[]>();

/** Everything written down about a piece, lowercased, for keyword checks. */
export function hay(item: Item) {
  const cached = hayCache.get(item);
  if (cached != null) return cached;
  const text = `${item.name} ${item.subcategory ?? ""} ${item.silhouette ?? ""} ${item.material ?? ""}`.toLowerCase();
  hayCache.set(item, text);
  return text;
}

export function families(item: Item) {
  const cached = familyCache.get(item);
  if (cached) return cached;
  const read = () => {
    try {
      const stored = JSON.parse(item.colorFamilies || "[]") as string[];
      if (stored.length) return stored.map((c) => c.toLowerCase());
    } catch {
      /* fall through */
    }
    try {
      return (JSON.parse(item.colors) as string[]).map((c) => c.toLowerCase());
    } catch {
      return [];
    }
  };
  const out = read();
  familyCache.set(item, out);
  return out;
}

export function isNeutral(colors: string[]) {
  return colors.every((c) => NEUTRALS.has(c));
}

export function isShort(item: Item) {
  const text = hay(item);
  if (text.includes("short") || text.includes("trunk") || text.includes("bermuda")) return true;
  if (/\bpant|\btrouser|\bchino|\bjean|\bjogg|\bsweatpant/.test(text) && !text.includes("short")) return false;
  return false;
}
