import type { Item } from "@prisma/client";
import { families, hay, isNeutral } from "@/lib/garment";
import { isGraphic, pieceKind } from "@/lib/kinds";
import { layerKind, type LayerKind } from "@/lib/layering";
import { register } from "@/lib/register";

/**
 * Pairings that have looked right for decades, written down. A tee on chinos, an
 * oxford on chinos, a hoodie on joggers, a polo on chino shorts. Nothing here is
 * learned; it is the menswear canon the closet is measured against, weighted from
 * the aesthetics research. The top's kind is read finely: a knit polo, a pique polo,
 * and a performance polo do not sit on the same trousers.
 */
type TopKind = "tee" | "graphic tee" | "athletic tee" | "jersey" | "polo" | "knit polo" | "perf polo" | "shirt" | "henley" | "sweater" | "hoodie" | "sweatshirt";

function topKind(top: Item): TopKind {
  const fine = layerKind(top);
  const map: Partial<Record<LayerKind, TopKind>> = {
    tee: "tee", "ls tee": "tee", "graphic tee": "graphic tee", "athletic tee": "athletic tee", jersey: "jersey",
    polo: "polo", "knit polo": "knit polo", "perf polo": "perf polo", shirt: "shirt", "linen shirt": "shirt",
    henley: "henley", "thermal henley": "henley", "knit henley": "henley", "ss sweater": "sweater", sweater: "sweater",
    "chunky sweater": "sweater", "quarter-zip": "sweater", "perf quarter-zip": "sweater", hoodie: "hoodie", "zip hoodie": "hoodie", sweatshirt: "sweatshirt",
  };
  return map[fine] ?? "tee";
}

const CANON: Record<TopKind, Record<string, number>> = {
  tee: { chino: 10, jean: 10, short: 10, "work pant": 8, "cargo pant": 8, "linen pant": 6, "athletic short": 6, sweatpant: 2, "dress pant": -6 },
  "graphic tee": { jean: 8, "cargo pant": 8, "work pant": 6, short: 6, "athletic short": 4, sweatpant: 4, chino: 2, "linen pant": -4, "dress pant": -12 },
  "athletic tee": { "athletic short": 2, sweatpant: 2, "cargo pant": 2, "work pant": 0, short: 0, jean: -2, chino: -8, "linen pant": -10, "dress pant": -16 },
  jersey: { "cargo pant": 0, "work pant": 0, jean: 0, sweatpant: 0, short: -4, "athletic short": -15, chino: -8, "linen pant": -10, "dress pant": -15 },
  polo: { chino: 10, short: 0, "dress pant": 6, "linen pant": 6, jean: 4, "work pant": -4, "cargo pant": -4, "athletic short": -12, sweatpant: -15 },
  "knit polo": { chino: 10, "dress pant": 8, short: 0, "linen pant": 6, jean: 4, "work pant": -6, "cargo pant": -6, "athletic short": -12, sweatpant: -15 },
  "perf polo": { chino: 4, short: 0, jean: 2, "athletic short": 0, "work pant": -10, "cargo pant": -10, "linen pant": 0, "dress pant": -4, sweatpant: -8 },
  shirt: { chino: 10, "dress pant": 2, jean: 8, "linen pant": 2, short: 8, "work pant": 0, "cargo pant": -4, "athletic short": -12, sweatpant: -12 },
  henley: { jean: 8, "work pant": 6, chino: 6, "cargo pant": 6, short: 2, "linen pant": 2, sweatpant: -4, "dress pant": -6, "athletic short": -8 },
  sweater: { chino: 10, jean: 8, "dress pant": 6, "work pant": 4, "cargo pant": 0, "linen pant": -6, short: -8, sweatpant: -8, "athletic short": -14 },
  hoodie: { sweatpant: 6, jean: 6, "cargo pant": 6, "work pant": 6, "athletic short": 2, short: 0, chino: -2, "dress pant": -4, "linen pant": -10 },
  sweatshirt: { sweatpant: 6, jean: 6, "cargo pant": 6, "work pant": 6, "athletic short": 2, short: 0, chino: -2, "dress pant": -4, "linen pant": -10 },
};

function loudness(item: Item) {
  const scale = (() => {
    try {
      return item.profile ? (JSON.parse(item.profile) as { patternScale?: string }).patternScale ?? "none" : "none";
    } catch {
      return "none";
    }
  })();
  // A jersey is loud; "cotton jersey" is a fabric. A small chest logo is not a pattern.
  const pattern = `${item.pattern ?? ""} ${item.name}`.toLowerCase();
  if (pieceKind(item) === "jersey") return 2;
  if (isGraphic(item)) return 2;
  if (/stripe|windowpane|plaid/.test(pattern) && !/pinstripe/.test(pattern)) return 2;
  if (scale === "small" || /check|dot|pinstripe/.test(pattern)) return 1;
  return 0;
}

export function isLoud(item: Item) {
  return loudness(item) >= 2;
}

function patternScore(top: Item, bottom: Item, layers: Item[]) {
  const clothes = [top, bottom, ...layers];
  const loud = clothes.filter(isLoud);
  const small = clothes.filter((item) => loudness(item) === 1);
  const reasons: string[] = [];
  let score = 0;
  if (loud.length === 1 && small.length === 0) {
    const rest = clothes.filter((item) => item !== loud[0]);
    if (rest.every((item) => isNeutral(families(item).slice(0, 1)))) {
      score += 3;
      reasons.push("One pattern, everything else quiet");
    }
  } else if (loud.length + small.length === 2) {
    score -= loud.length === 2 ? 10 : 3;
  } else if (loud.length + small.length >= 3) {
    score -= 18;
  }
  const outermost = layers[layers.length - 1];
  if (outermost && isLoud(top) && isLoud(outermost)) score -= 10;
  if (layerKind(top) === "graphic tee" && layers.some((layer) => ["shirt jacket", "sweater", "chunky sweater", "quarter-zip"].includes(layerKind(layer)))) score -= 8;
  if (pieceKind(top) === "jersey" && [bottom, ...layers].some((item) => !isNeutral(families(item).slice(0, 1)))) score -= 6;
  return { score, reasons };
}

const TEXTURES = ["waffle", "rib", "piqu", "knit", "fleece", "linen", "canvas", "twill", "wool", "denim", "corduroy", "suede", "leather"];

function textures(item: Item) {
  const text = hay(item);
  return TEXTURES.filter((t) => text.includes(t)).map((t) => (t === "piqu" ? "pique" : t));
}

function textureScore(top: Item, bottom: Item, layers: Item[]) {
  const clothes = [top, bottom, ...layers];
  const distinct = new Set(clothes.flatMap(textures));
  const reasons: string[] = [];
  let score = 0;
  if (distinct.size >= 4) score -= 2;
  else if (distinct.size >= 2) {
    score += 3;
    reasons.push("Textures that play off each other");
  }
  const ht = hay(top);
  const hb = hay(bottom);
  if (/waffle|knit|fleece|rib/.test(ht) && /canvas|twill|carpenter|work pant|cargo/.test(hb)) score += 2;
  if (/knit|piqu/.test(ht) && /linen|twill/.test(hb)) score += 2;
  if (/dri-fit|dri fit|performance|polyester/.test(ht) && (/linen|wool/.test(hb) || /slim.*chino|chino.*slim/.test(hb))) score -= 6;
  if (/fleece|sweatpant|jogger/.test(hb) && /shirt|oxford|button/.test(ht) && !/tee|sweatshirt/.test(ht)) score -= 8;
  const anyLinen = clothes.some((item) => /linen/.test(hay(item)));
  const anyFleeceWool = clothes.some((item) => /fleece|wool|corduroy/.test(hay(item)));
  if (anyLinen && anyFleeceWool) score -= 6;
  if (/waffle|thermal/.test(ht) && /linen/.test(hb)) score -= 4;
  if (["knit polo", "ss sweater", "knit henley"].includes(layerKind(top)) && layers.some((layer) => ["sweater", "chunky sweater", "quarter-zip"].includes(layerKind(layer)))) score -= 4;
  return { score, reasons };
}

export function classicScore(top: Item, bottom: Item, layersIn?: Item[] | Item | null) {
  const layers = Array.isArray(layersIn) ? layersIn : layersIn ? [layersIn] : [];
  const reasons: string[] = [];
  let score = 0;

  const tk = topKind(top);
  const bk = pieceKind(bottom);
  const canon = CANON[tk]?.[bk];
  if (canon != null) {
    score += canon;
    if (canon >= 8) reasons.push(`${cap(tk)} on ${bk}: a classic`);
  }
  // The trouser rules that do not fit a matrix.
  if (layers.length && (bk === "short" || bk === "athletic short") && !layers.every((layer) => /shirt/.test(hay(layer)) && !/jacket|sweat/.test(hay(layer)))) {
    const heavy = layers.some((layer) => layer.warmth >= 4 || /wool|knit blend|fleece/.test(hay(layer)));
    score -= heavy ? 10 : 6;
  }
  if (bk === "sweatpant" && bottom.warmth >= 4 && register(top) > 2) score -= 10;
  if (/cargo/.test(hay(bottom)) && bk === "short" && register(top) >= 4) score -= 12;
  // Linen on linen is a summer set.
  if (tk === "shirt" && /linen/.test(hay(top)) && bk === "linen pant") score += 6;
  if (tk === "hoodie" && bk === "dress pant" && (isLoud(top) || /team|soccer/.test(hay(top)))) score -= 8;

  const pattern = patternScore(top, bottom, layers);
  score += pattern.score;
  reasons.push(...pattern.reasons);
  const texture = textureScore(top, bottom, layers);
  score += texture.score;
  reasons.push(...texture.reasons);

  return { score, reasons };
}

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
