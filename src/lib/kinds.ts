import type { Item } from "@prisma/client";
import { hay } from "@/lib/garment";
import { shoeKind } from "@/lib/shoes";

export type Sleeve = "long" | "short";

/**
 * How far a sleeve reaches. Written sleeve length wins; otherwise the cut says it
 * (a hoodie or an oxford is long, a tee or polo is short); a warm top with no
 * cut named is assumed long. Anything worn over another layer counts as long.
 */
const sleeveCache = new WeakMap<Item, Sleeve>();
const kindCache = new WeakMap<Item, string>();

export function sleeveLength(item: Item): Sleeve {
  const cached = sleeveCache.get(item);
  if (cached) return cached;
  const out = readSleeve(item);
  sleeveCache.set(item, out);
  return out;
}

function readSleeve(item: Item): Sleeve {
  const text = hay(item);
  if (/short[- ]?sleeve|\bs\/s\b|sleeveless|\btank\b/.test(text)) return "short";
  if (item.category === "outer") return "long";
  if (/long[- ]?sleeve|\bl\/s\b/.test(text)) return "long";
  if (/hoodie|sweatshirt|sweater|quarter[- ]zip|cardigan|fleece|flannel|thermal|waffle|turtleneck|jacket|coat|overshirt|shacket|pullover|crewneck knit|rugby/.test(text)) {
    return "long";
  }
  if (/oxford|button[- ](up|down)|dress shirt|flannel/.test(text)) return "long";
  if (/\btee\b|t-shirt|polo|jersey|\btank\b|camp collar|linen shirt/.test(text)) return "short";
  return item.warmth >= 3 ? "long" : "short";
}

/** The cut of a piece in words, without its fabric: "cotton jersey" is not a jersey, and a brand is not a collar. */
function cut(item: Item) {
  return `${item.name} ${item.subcategory ?? ""} ${item.silhouette ?? ""}`.toLowerCase().replace(/polo ralph lauren/g, "ralph lauren");
}

/**
 * The kind of piece, for pairing rules and for keeping days from looking alike.
 * Finer than the catalog's subcategory where the rules care (athletic vs chino
 * shorts, jeans vs chinos), coarser where they do not.
 */
export function pieceKind(item: Item) {
  const cached = kindCache.get(item);
  if (cached) return cached;
  const out = readKind(item);
  kindCache.set(item, out);
  return out;
}

function readKind(item: Item) {
  const text = cut(item);
  const fabric = (item.material ?? "").toLowerCase();
  if (item.category === "bottom") {
    if (/short|trunk|bermuda/.test(text)) {
      return /athletic|performance|running|gym|basketball|puma|nike|adidas|new balance/.test(text) ||
        /nylon|dri-fit|dri fit|mesh|performance/.test(fabric)
        ? "athletic short"
        : "short";
    }
    if (/sweat|jogg|fleece/.test(text)) return "sweatpant";
    if (/denim|jean/.test(text) || /denim/.test(fabric)) return "jean";
    if (/cargo/.test(text)) return "cargo pant";
    if (/linen/.test(text)) return "linen pant";
    if (/chino|khaki/.test(text)) return "chino";
    if (/dress|trouser|suit|wool/.test(text)) return "dress pant";
    if (/work|carpenter|canvas|painter|utility|corduroy/.test(text)) return "work pant";
    if (/track|warm-up|warm up/.test(text)) return "sweatpant";
    return item.subcategory?.toLowerCase() || "bottom";
  }
  if (item.category === "top" || item.category === "outer") {
    if (/\bjersey\b/.test(text)) return "jersey";
    if (/\btee\b|t-shirt/.test(text) && (/dri-fit|dri fit|performance|athletic/.test(text) || /dri-fit|dri fit|performance/.test(fabric))) {
      return "athletic tee";
    }
    if (/hoodie/.test(text)) return "hoodie";
    if (/sweatshirt|crewneck fleece/.test(text)) return "sweatshirt";
    if (/sweater|quarter[- ]zip|half[- ]zip|cardigan|knit pullover/.test(text)) return "sweater";
    if (/\bpolo\b/.test(text)) return "polo";
    if (/\bhenley\b/.test(text)) return "henley";
    if (/\b(coat|parka|puffer|overcoat)\b/.test(text)) return "coat";
    if (/\b(jacket|bomber|shacket|overshirt|windbreaker|anorak|vest)\b/.test(text)) return "jacket";
    if (/oxford|button[- ](up|down)|dress shirt|flannel|linen shirt|camp collar|short[- ]sleeve shirt|\bshirt\b/.test(text)) {
      return "shirt";
    }
    if (/\btee\b|t-shirt|\btank\b/.test(text)) return "tee";
    return item.subcategory?.toLowerCase() || item.category;
  }
  if (item.category === "shoes") return shoeKind(item);
  return item.category;
}

/** "tee + chino": the shape of a look, whatever the exact pieces. */
export function pairKind(items: Item[]) {
  const top = items.find((item) => item.category === "top") ?? items.find((item) => item.category === "outer");
  const bottom = items.find((item) => item.category === "bottom");
  if (!top || !bottom) return "";
  return `${pieceKind(top)} + ${pieceKind(bottom)}`;
}

/**
 * A tee whose print is the point: a band graphic, a big logo across the chest, a trefoil.
 * A small chest mark or a pony on the pocket is a plain tee.
 */
export function isGraphic(item: Item) {
  const name = item.name.toLowerCase();
  if (/graphic|grateful|trefoil|band tee|logo tee/.test(name)) return true;
  if (/small|pony|pocket|chest/.test(name)) return false;
  try {
    return item.profile ? (JSON.parse(item.profile) as { patternScale?: string }).patternScale === "large" && /graphic|logo|print/.test((item.pattern ?? "").toLowerCase()) : false;
  } catch {
    return false;
  }
}

export type LayerRole = "base" | "mid" | "shell";

/**
 * Where a piece sits in a stack. A tee, henley, polo, shirt, or jersey is a base. A
 * sweatshirt, hoodie, quarter-zip, or sweater is a mid: it goes over a base, or is
 * worn alone as the top. A jacket, coat, or shirt jacket is a shell and always outermost.
 */
export function layerRole(item: Item): LayerRole {
  const kind = pieceKind(item);
  // A fleece jacket insulates but stops neither wind nor rain: it is a mid that zips.
  if (kind === "jacket" && /fleece/.test(hay(item))) return "mid";
  if (["jacket", "coat"].includes(kind)) return "shell";
  if (kind === "sweater" && sleeveLength(item) === "short") return "base";
  if (["hoodie", "sweatshirt", "sweater"].includes(kind)) return "mid";
  if (item.category === "outer") return (item.layerRole ?? "").toLowerCase() === "shell" ? "shell" : "mid";
  return "base";
}

export function hasHood(item: Item) {
  return /hood/.test(hay(item));
}

/** A collar that shows: polos, shirts, and collared jackets. */
export function hasCollar(item: Item) {
  const text = hay(item).replace(/polo ralph lauren/g, "ralph lauren");
  // "sweatshirt" and "t-shirt" are not shirts.
  return /\bpolo\b|(?<![\w-])shirt\b|\boxford\b|\bbutton-?(up|down)\b|\bcollar|\bblazer\b/.test(text) && !/crewneck|crew neck/.test(text);
}

/** Technical fabric: the piece reads as sportswear whatever its cut. */
export function isTechnical(item: Item) {
  return /dri-fit|dri fit|performance|technical|polyester|nylon|mesh|primeknit/.test(hay(item));
}

export function isZip(item: Item) {
  return /zip/.test(hay(item)) && !/quarter[- ]zip|half[- ]zip/.test(hay(item));
}

export function isQuarterZip(item: Item) {
  return /quarter[- ]zip|half[- ]zip/.test(hay(item));
}
