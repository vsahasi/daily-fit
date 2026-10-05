import type { Item } from "@prisma/client";
import { families, hay, isNeutral } from "@/lib/garment";

/**
 * Colour, whole-outfit. A neutral base with at most one accent, value contrast between
 * the top and the bottom, the classic pairs, and the pairs held to clash.
 */
const LIGHTNESS: Record<string, number> = {
  white: 95, ivory: 92, cream: 90, oatmeal: 85, sand: 80, beige: 78, stone: 75, tan: 65, khaki: 68,
  yellow: 80, gold: 55, pink: 75, "light blue": 82, grey: 55, gray: 55, blue: 60, green: 40, olive: 40, red: 45,
  orange: 55, burgundy: 30, purple: 35, brown: 35, navy: 20, charcoal: 25, black: 10,
};
const EARTH = new Set(["red", "burgundy", "gold", "yellow", "orange", "brown", "olive", "green"]);
const SATURATED = new Set(["red", "yellow", "green", "purple", "pink", "orange", "gold"]);
const CLASSIC: [string, string, number][] = [
  ["navy", "white", 4], ["navy", "khaki", 4], ["navy", "sand", 4], ["navy", "cream", 3], ["navy", "brown", 3],
  ["olive", "white", 4], ["olive", "cream", 4], ["olive", "grey", 3], ["olive", "navy", 2], ["olive", "black", 1],
  ["olive", "sand", 3], ["olive", "khaki", 2], ["grey", "burgundy", 3], ["grey", "black", 3], ["cream", "brown", 3],
  ["black", "white", 3], ["navy", "gold", 2], ["charcoal", "white", 3], ["charcoal", "cream", 3],
  ["blue", "grey", 3], ["blue", "khaki", 3], ["blue", "sand", 3], ["blue", "cream", 3], ["brown", "white", 3], ["green", "cream", 2], ["green", "navy", 2],
];
const CLASH: [string, string, number][] = [
  ["navy", "black", -8], ["brown", "black", -4], ["navy", "charcoal", -2], ["olive", "orange", -6], ["brown", "gold", -3],
];

/** The colour a piece reads as from across the room: its first family. A logo or a trim is not its colour. */
function main(item: Item) {
  const first = families(item)[0];
  if (!first) return "";
  if ((first === "grey" || first === "gray") && /charcoal/.test(hay(item))) return "charcoal";
  if (first === "blue" && /light blue|sky blue|pale blue/.test(hay(item))) return "light blue";
  return first === "gray" ? "grey" : first;
}

function lightness(item: Item) {
  const first = main(item);
  return first ? LIGHTNESS[first] ?? 50 : 50;
}

function pairScore(a: Item, b: Item, table: [string, string, number][]) {
  const same = (x: string) => (x === "charcoal" ? ["charcoal", "grey"] : x === "light blue" ? ["light blue", "blue"] : [x]);
  const fa = same(main(a));
  const fb = same(main(b));
  let best = 0;
  for (const [x, y, value] of table) {
    if ((fa.includes(x) && fb.includes(y)) || (fa.includes(y) && fb.includes(x))) {
      best = value < 0 ? Math.min(best, value) : Math.max(best, value);
    }
  }
  return best;
}

export function paletteScore(pieces: Item[]) {
  const reasons: string[] = [];
  const clothes = pieces.filter((item) => item.category !== "shoes" && item.category !== "accessory");
  const top = clothes.find((item) => item.category === "top");
  const bottom = clothes.find((item) => item.category === "bottom");
  const layers = clothes.filter((item) => item.category === "outer");
  const outermost = layers[layers.length - 1];
  if (!top || !bottom) return { score: 0, reasons };
  let score = 0;

  // Neutrals plus one accent.
  const accents = new Set<string>();
  const hues = new Set<string>();
  for (const item of clothes) {
    const c = main(item);
    if (!c) continue;
    hues.add(c === "charcoal" ? "grey" : c === "light blue" ? "blue" : c);
    if (c !== "charcoal" && c !== "light blue" && !isNeutral([c])) accents.add(c);
  }
  if (accents.size === 0) {
    score += 4;
  } else if (accents.size === 1) {
    score += 5;
    reasons.push("One colour, on neutrals");
  } else if (accents.size === 2) {
    if (![...accents].every((c) => EARTH.has(c))) score -= 6;
  } else {
    score -= 12;
    reasons.push("Too many colours");
  }
  const loud = [...accents].filter((c) => SATURATED.has(c));
  if (loud.length >= 2) score -= 8;
  if (hues.size >= 5) score -= 8;
  else if (hues.size === 4) score -= 4;

  // Value contrast between the top and the bottom.
  const diff = Math.abs(lightness(top) - lightness(bottom));
  if (diff >= 30) {
    score += 5;
    if (main(top) && main(bottom)) reasons.push(`${cap(main(top))} over ${main(bottom)}`);
  } else if (diff >= 10) {
    score += 3;
  } else {
    // The same value top and bottom reads as one flat block, whatever the fabric.
    score -= 4;
  }

  // Light on light with a white anchor is the summer classic.
  if (["white", "cream", "ivory"].includes(main(top)) && lightness(bottom) >= 65 && layers.length === 0) {
    score += 3;
  }

  // Pairs with a history, and pairs held to clash.
  const classic = pairScore(top, bottom, CLASSIC) + (outermost ? pairScore(outermost, bottom, CLASSIC) / 2 : 0);
  score += classic;
  if (classic >= 4) reasons.push("A pairing with a history");
  score += pairScore(top, bottom, CLASH) + (outermost ? pairScore(top, outermost, CLASH) : 0);
  // What shows is the outermost piece: it is judged against the trousers too.
  const visible = outermost ?? top;
  if (outermost) {
    const clash = pairScore(outermost, bottom, CLASH);
    score += lightness(top) >= 80 ? clash / 2 : clash;
    if (main(outermost) === main(bottom)) score -= 8;
  }
  // A mid layer shows at the collar and hem: it is checked against the trousers too.
  for (const mid of layers.slice(0, -1)) {
    score += pairScore(mid, bottom, CLASH) / 2;
    if (main(mid) === main(bottom)) score -= 3;
  }
  if (main(bottom) === "olive") {
    if (main(visible) === "olive") score -= 8;
    else if (main(visible) === "green") score -= 5;
    if (outermost && main(top) === "green") score -= 3;
  }
  // One dark mass: what shows (the outer piece, or the top alone) and the trousers both near black.
  if (lightness(visible) < 30 && lightness(bottom) < 30 && main(visible) !== main(bottom)) score -= 3;
  if (lightness(visible) < 30 && lightness(bottom) < 30 && layers.every((layer) => lightness(layer) < 30)) score -= 3;

  // The outer layer is the dark one.
  if (outermost) {
    const outerL = lightness(outermost);
    const innerL = lightness(top);
    if (outerL < innerL - 10) score += 2;
    else if (outerL > innerL + 10 && !isNeutral(families(outermost))) score -= 2;
  }

  return { score, reasons };
}

/** Shoes against the clothes: the sandwich, and matching the value of the trousers. */
export function shoePaletteScore(shoe: Item, clothes: Item[]) {
  const top = clothes.find((item) => item.category === "top");
  const bottom = clothes.find((item) => item.category === "bottom");
  const layers = clothes.filter((item) => item.category === "outer");
  if (!top || !bottom) return 0;
  const shoeL = lightness(shoe);
  const bottomL = lightness(bottom);
  const topL = lightness(layers[layers.length - 1] ?? top);
  let score = 0;
  const shoeFamilies = families(shoe);
  const echoes = [top, ...layers].some((item) => shoeFamilies.includes(main(item)));
  if (echoes) score += 3;
  const dark = (l: number) => l < 45;
  const light = (l: number) => l >= 60;
  if ((dark(shoeL) && dark(bottomL)) || (light(shoeL) && light(bottomL))) score += 3;
  else if (dark(shoeL) && light(bottomL) && light(topL)) score -= 3;
  else if (light(shoeL) && dark(bottomL) && dark(topL) && main(bottom) !== "olive") score -= 1;
  // The white sneaker rule: a light neutral shoe goes under almost any trouser.
  const whiteish = shoeFamilies.every((c) => ["white", "cream", "ivory", "sand"].includes(c));
  if (whiteish && ["sand", "cream", "khaki", "olive", "grey", "navy", "blue", "tan", "brown", "gold"].includes(main(bottom))) score += 3;
  // And its mirror: a black shoe under black, charcoal, or navy trousers.
  const blackish = shoeFamilies.length > 0 && shoeFamilies.every((c) => ["black", "charcoal", "navy"].includes(c));
  if (blackish && ["black", "charcoal", "navy"].includes(main(bottom))) score += 3;
  if (blackish && main(bottom) === "brown") score -= 14;
  return score;
}

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export { lightness, main as mainColor };
