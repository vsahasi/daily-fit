import type { Item } from "@prisma/client";
import { families, hay, isNeutral } from "@/lib/garment";
import { hasCollar, hasHood, isGraphic, isQuarterZip, isTechnical, isZip, layerRole, pieceKind, sleeveLength } from "@/lib/kinds";
import { register } from "@/lib/register";

/**
 * The finer kind a piece plays in a stack. Built from the catalog kind plus fabric:
 * a performance quarter-zip and a cotton one behave differently over an oxford.
 */
export type LayerKind =
  | "tee" | "graphic tee" | "ls tee" | "henley" | "thermal henley" | "knit henley"
  | "polo" | "knit polo" | "perf polo" | "jersey" | "athletic tee" | "ss sweater" | "sweater" | "chunky sweater"
  | "shirt" | "linen shirt" | "sweatshirt" | "hoodie" | "zip hoodie" | "quarter-zip" | "perf quarter-zip"
  | "fleece jacket" | "shirt jacket" | "bomber" | "zip shell" | "coat" | "other";

const cache = new WeakMap<Item, LayerKind>();

export function layerKind(item: Item): LayerKind {
  const cached = cache.get(item);
  if (cached) return cached;
  const out = readLayerKind(item);
  cache.set(item, out);
  return out;
}

function readLayerKind(item: Item): LayerKind {
  const text = hay(item);
  const kind = pieceKind(item);
  const tech = isTechnical(item);
  switch (kind) {
    case "tee":
      if (isGraphic(item)) return "graphic tee";
      return sleeveLength(item) === "long" ? "ls tee" : "tee";
    case "athletic tee": return "athletic tee";
    case "jersey": return "jersey";
    case "henley":
      if (/waffle|thermal/.test(text)) return "thermal henley";
      if (/knit/.test(text) && sleeveLength(item) === "long") return "knit henley";
      return "henley";
    case "polo":
      if (tech) return "perf polo";
      return /knit|sweater/.test(text) && !/piqu/.test(text) ? "knit polo" : "polo";
    case "sweater":
      if (isQuarterZip(item)) return tech ? "perf quarter-zip" : item.warmth >= 4 ? "chunky sweater" : "quarter-zip";
      if (sleeveLength(item) === "short") return "ss sweater";
      return item.warmth >= 4 ? "chunky sweater" : "sweater";
    case "shirt": return /linen/.test(text) ? "linen shirt" : "shirt";
    case "sweatshirt": return "sweatshirt";
    case "hoodie": return isZip(item) ? "zip hoodie" : "hoodie";
    case "jacket":
      if (/fleece/.test(text)) return "fleece jacket";
      if (/shirt jacket|overshirt|shacket|chore/.test(text)) return "shirt jacket";
      if (/bomber|collared|knit blend|heavy knit/.test(text)) return "bomber";
      return "zip shell";
    case "coat": return "coat";
    default:
      if (item.category === "outer") return isZip(item) ? "zip shell" : "other";
      return "other";
  }
}

const MIDS = new Set<LayerKind>(["sweatshirt", "hoodie", "zip hoodie", "quarter-zip", "perf quarter-zip", "sweater", "chunky sweater", "fleece jacket"]);
const SHELLS = new Set<LayerKind>(["shirt jacket", "bomber", "zip shell", "coat"]);
const COLLARED_TOPS = new Set<LayerKind>(["polo", "knit polo", "perf polo", "shirt", "linen shirt"]);
const KNIT_TOPS = new Set<LayerKind>(["knit henley", "ss sweater", "knit polo"]);

/** A button-up worn open over a tee: the lightest layer there is. Only a shirt read as a layer counts. */
export function isOpenShirt(item: Item) {
  return item.category === "outer" && (layerKind(item) === "shirt" || layerKind(item) === "linen shirt");
}

export function isMidKind(item: Item) {
  return MIDS.has(layerKind(item));
}

export function isShellKind(item: Item) {
  return SHELLS.has(layerKind(item)) || layerRole(item) === "shell";
}

/** What one layer is worth over what is under it. `null` means the pair is out. */
export function pairValue(inner: Item, outer: Item): { value: number | null; why?: string; reason?: string } {
  const ik = layerKind(inner);
  const ok = layerKind(outer);
  const innerMid = MIDS.has(ik);
  const outerMid = MIDS.has(ok);
  const outerShell = SHELLS.has(ok);

  if (SHELLS.has(ik)) return { value: null, why: "Nothing goes over a jacket" };
  if ((ok === "shirt" || ok === "linen shirt") && !["tee", "ls tee", "graphic tee"].includes(ik)) {
    return { value: null, why: "A shirt worn open goes over a tee" };
  }
  if (innerMid && outerMid) return { value: null, why: `A ${ok} over a ${ik}` };
  if (sleeveLength(outer) === "short" && sleeveLength(inner) === "long") return { value: null, why: "Short sleeves over long" };
  if (hasHood(inner) && hasHood(outer)) return { value: null, why: "Two hoods" };
  if (hasHood(inner) && outerMid) return { value: null, why: `A hood under a ${ok}` };
  if ((ok === "hoodie" || ok === "sweatshirt") && COLLARED_TOPS.has(ik)) return { value: null, why: `A ${ik} under a ${ok}` };
  if (ok === "zip hoodie" && (ik === "polo" || ik === "knit polo" || ik === "perf polo" || ik === "linen shirt" || ik === "shirt")) {
    return { value: null, why: `A ${ik} under a zip hoodie` };
  }
  // A polo collar under a quarter-zip or a sweater bunches; a polo goes under a jacket or nothing.
  if ((ik === "polo" || ik === "knit polo" || ik === "perf polo") && outerMid && ok !== "fleece jacket") {
    return { value: null, why: `A polo under a ${ok}` };
  }
  if (ik === "jersey" && (outerMid || ok === "shirt jacket")) return { value: null, why: `A jersey under a ${ok}` };
  if (KNIT_TOPS.has(ik) && outerMid) return { value: null, why: `Knit on knit` };
  if (ik === "chunky sweater" && ok === "shirt jacket") return { value: null, why: "A chunky sweater under a shirt jacket" };
  if (ok === "chunky sweater" && !["tee", "ls tee", "henley", "thermal henley", "graphic tee"].includes(ik)) {
    return { value: null, why: `A ${ik} under a chunky sweater` };
  }
  if (hasCollar(inner) && hasCollar(outer) && outerMid) return { value: null, why: "Two collars" };
  const linen = (item: Item) => /linen/.test(hay(item));
  const fleecy = (item: Item) => /fleece|wool|hoodie|bomber|shirt jacket/.test(hay(item)) || MIDS.has(layerKind(item));
  if ((linen(inner) && fleecy(outer)) || (linen(outer) && fleecy(inner))) return { value: null, why: "Linen with fleece or wool" };
  if (ok === "shirt jacket" && isTechnical(inner)) return { value: null, why: `${inner.name} under a shirt jacket` };
  const gap = Math.abs(register(inner) - register(outer));
  if (gap >= 3 && !(isTechnical(inner) && ok === "zip shell")) return { value: null, why: `A ${ik} under a ${ok}` };

  let value = 0;
  let reason: string | undefined;
  const tech = isTechnical(inner);

  // The canon: what sits well over what.
  const TABLE: Partial<Record<LayerKind, Partial<Record<LayerKind, number>>>> = {
    "fleece jacket": { "zip shell": 3, coat: 3, bomber: -8, "shirt jacket": -6 },
    "tee": { shirt: 3, "linen shirt": 3, "fleece jacket": 3, "shirt jacket": 4, bomber: 3, "zip shell": 2, "quarter-zip": 3, "perf quarter-zip": 1, sweatshirt: 2, hoodie: 2, "zip hoodie": 2, sweater: 3, "chunky sweater": 2, coat: 2 },
    "ls tee": { shirt: 2, "fleece jacket": 3, "shirt jacket": 4, bomber: 3, "zip shell": 2, "quarter-zip": 3, sweatshirt: 2, hoodie: 1, "zip hoodie": 1, sweater: 3, "chunky sweater": 2, coat: 2 },
    "graphic tee": { "shirt jacket": -8, bomber: 0, "zip shell": 1, "zip hoodie": 0, hoodie: -2, sweatshirt: -2, "quarter-zip": -4, sweater: -8, coat: 0 },
    "henley": { "fleece jacket": 3, "shirt jacket": 4, bomber: 3, "zip shell": 1, "quarter-zip": 2, sweatshirt: 1, hoodie: 0, "zip hoodie": 1, sweater: 2, "chunky sweater": 1, coat: 2 },
    "thermal henley": { "fleece jacket": 3, "shirt jacket": 5, bomber: 4, "zip shell": 3, "quarter-zip": 3, sweatshirt: 3, hoodie: 3, "zip hoodie": 3, sweater: 3, "chunky sweater": 3, coat: 3 },
    "knit henley": { "shirt jacket": 2, bomber: 2, "zip shell": 0, coat: 2 },
    "ss sweater": { "shirt jacket": 2, bomber: 2, "zip shell": -2, coat: 1 },
    "shirt": { "fleece jacket": -2, "quarter-zip": 4, sweatshirt: 1, "perf quarter-zip": -3, "shirt jacket": 3, bomber: 3, "zip shell": -3, "zip hoodie": -3, sweater: 4, coat: 3 },
    "linen shirt": { "quarter-zip": 0, "zip shell": -2 },
    "polo": { "shirt jacket": 1, bomber: 1, "zip shell": -2, "quarter-zip": -2, "perf quarter-zip": -1, sweatshirt: -4, sweater: -1, coat: 0 },
    "knit polo": { "shirt jacket": 3, bomber: 3, "zip shell": -2, "quarter-zip": -1, sweatshirt: -1, sweater: -4, coat: 1 },
    "perf polo": { bomber: -1, "zip shell": 1, "quarter-zip": -2, "perf quarter-zip": 0, sweatshirt: -4, "shirt jacket": -4 },
    "athletic tee": { "fleece jacket": 2, "zip shell": 2, "perf quarter-zip": 2, "zip hoodie": 1, hoodie: 1, sweatshirt: 0, bomber: -3, "quarter-zip": -2 },
    "jersey": { "zip shell": 1, bomber: -3 },
    "sweatshirt": { "shirt jacket": 4, bomber: 3, "zip shell": 3, coat: 3 },
    "hoodie": { bomber: item_hoodie_bomber(inner), "zip shell": 3, "shirt jacket": 2, coat: 2 },
    "zip hoodie": { bomber: 2, "zip shell": 2, "shirt jacket": 1, coat: 2 },
    "quarter-zip": { bomber: 3, "shirt jacket": 2, "zip shell": 1, coat: 3 },
    "perf quarter-zip": { "zip shell": 3, bomber: 0, "shirt jacket": -2, coat: 0 },
    "sweater": { bomber: 3, "shirt jacket": 3, "zip shell": 0, coat: 4 },
    "chunky sweater": { bomber: -3, "shirt jacket": -4, "zip shell": -4, coat: 0 },
  };
  const table = TABLE[ik]?.[ok];
  if (table != null) {
    value += table;
    if (table >= 4) reason = `A ${ok} over a ${ik}`;
  }

  // Thin inside, thick outside; knit under woven.
  if (inner.warmth < outer.warmth) value += 2;
  else if (inner.warmth > outer.warmth && ok !== "zip shell") value -= 4;
  if (innerMid && outerShell && /knit|fleece/.test(hay(inner)) && /woven|twill|wool|nylon|canvas|shell/.test(hay(outer))) value += 3;
  if (ik === "shirt" && outerMid && !tech && ok !== "fleece jacket") value += 3;

  // Register: two apart costs; sportswear over sportswear is coherent.
  if (gap >= 1.5) value -= 3;
  if (ok === "zip shell" && tech) value += 2;

  // Colour across the two layers: darker outside, one pattern at most.
  const loud = (item: Item) => {
    const scale = (() => {
      try {
        return item.profile ? (JSON.parse(item.profile) as { patternScale?: string }).patternScale : undefined;
      } catch {
        return undefined;
      }
    })();
    return isGraphic(item) || pieceKind(item) === "jersey" || (scale === "large" && /stripe|windowpane|plaid/.test(`${item.pattern ?? ""} ${item.name}`.toLowerCase())) || /windowpane|plaid/.test(item.name.toLowerCase());
  };
  if (loud(inner) && loud(outer)) value -= 4;
  const fi = families(inner);
  const fo = families(outer);
  if (fi.length && fo.length && fi[0] === fo[0] && (inner.material ?? "") === (outer.material ?? "")) value -= 1;
  const accents = new Set([fi[0], fo[0]].filter((c): c is string => Boolean(c) && !isNeutral([c])));
  if (accents.size >= 2) value -= 3;

  return { value, reason };
}

function item_hoodie_bomber(hoodie: Item) {
  // A thin hoodie under a bomber is a classic; a heavy, knit, or fleece one fights the jacket.
  return hoodie.warmth <= 3 && !/knit|fleece/.test(hay(hoodie).replace(/textured knit fleece/, "")) ? 4 : -1;
}

/**
 * How the carried layer ranks on a swing day: the piece that comes off by ten.
 * `null` means it cannot be the carried layer at all.
 */
export function removableRank(item: Item, high: number, wet = false): number | null {
  const kind = layerKind(item);
  // A thin shell is the right carry piece when rain or wind is about; otherwise it is just one option.
  if (kind === "zip shell") return wet ? 4 : 2;
  if (kind === "shirt jacket" || kind === "shirt" || kind === "linen shirt") return 3;
  if (kind === "fleece jacket") return 3;
  // A heavy knit bomber does not come along on a day headed past 70.
  if (kind === "bomber") return high >= 71 ? null : 3;
  if (kind === "zip hoodie" || kind === "coat") return 2;
  if (kind === "chunky sweater") return null;
  // A cotton quarter-zip is a pullover knit: fine to carry up to 70, not on a day headed past it.
  if (kind === "quarter-zip") return high >= 71 ? null : -1;
  if (kind === "perf quarter-zip") return -1;
  if (kind === "hoodie" || kind === "sweatshirt" || kind === "sweater") return high <= 66 ? -2 : null;
  return isZip(item) ? 2 : -2;
}

export type StackVerdict = { ok: true; score: number; reasons: string[] } | { ok: false; why: string };

/**
 * A whole stack read inner to outer: the top, then each layer. Every adjacent pair
 * must be allowed; the values add up.
 */
export function stackVerdict(top: Item, layers: Item[]): StackVerdict {
  if (layers.length > 2) return { ok: false, why: "Too many layers" };
  // Only a mid or a jacket goes over a top. A tee over a tee is not a layer.
  const stray = layers.find((layer) => !isMidKind(layer) && !isShellKind(layer) && layerRole(layer) !== "mid" && !isOpenShirt(layer));
  if (stray) return { ok: false, why: `${stray.name} is not a layer` };
  if (layers.length === 2 && layers.some(isOpenShirt)) return { ok: false, why: "An open shirt is the only layer, not one of two" };
  const order = [top, ...layers];
  let score = 0;
  const reasons: string[] = [];
  for (let i = 1; i < order.length; i += 1) {
    const pair = pairValue(order[i - 1], order[i]);
    if (pair.value == null) return { ok: false, why: pair.why ?? "That does not layer" };
    score += pair.value;
    if (pair.reason) reasons.push(pair.reason);
  }
  // Two good pairs should not outscore one great one just for being two.
  if (layers.length === 2) score = Math.round(score * 0.6);
  // A smart base under a track jacket reads wrong even with a mid between them.
  if (layers.length && Math.abs(register(top) - register(layers[layers.length - 1])) >= 2.5 && !isTechnical(top)) score -= 12;
  if (layers.length === 2) {
    const [mid, shell] = layers;
    if (!isMidKind(mid) && layerRole(mid) !== "mid") return { ok: false, why: `${mid.name} is not a mid layer` };
    if (!isShellKind(shell)) return { ok: false, why: `${shell.name} is not a jacket` };
    if (layerKind(mid) === "chunky sweater") return { ok: false, why: "A chunky sweater in three layers" };
    if (hasHood(mid) && (layerKind(shell) === "bomber" || layerKind(shell) === "coat")) score += 0;
    // The outermost is the darkest or most neutral piece.
    const outerNeutral = isNeutral(families(shell));
    if (outerNeutral) score += 2;
  }
  return { ok: true, score, reasons };
}
