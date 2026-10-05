import type { Item } from "@prisma/client";
import { families, hay, isNeutral } from "@/lib/garment";
import { isGraphic, isTechnical, pieceKind } from "@/lib/kinds";
import { streetKind } from "@/lib/shoes";

/**
 * Where a piece sits on the casual scale, 1 to 4 with halves: 1 athletic, 2 sweats and
 * streetwear, 3 campus casual and workwear, 4 smart casual. The rule that matters most,
 * across every source read: pieces close in register go together; three levels apart do not.
 */
const cache = new WeakMap<Item, number>();

export function register(item: Item): number {
  const cached = cache.get(item);
  if (cached != null) return cached;
  const out = read(item);
  cache.set(item, out);
  return out;
}

function read(item: Item): number {
  const text = hay(item);
  const kind = pieceKind(item);
  const tech = isTechnical(item);
  if (item.category === "shoes") {
    const shoe = streetKind(item);
    if (shoe === "sandal" || shoe === "runner") return 1;
    if (shoe === "clog") return 2;
    if (shoe === "dress shoe") return 4;
    if (shoe === "boot") return 3;
    return /leather|suede/.test(text) ? 3 : 2;
  }
  if (item.category === "bottom") {
    if (kind === "athletic short") return 1;
    if (kind === "sweatpant") return 1.5;
    if (kind === "short") {
      if (/cargo/.test(text)) return 2;
      if (/stripe|linen/.test(text)) return 2.5;
      return /chino/.test(text) ? 3.5 : 3;
    }
    if (kind === "chino" || kind === "dress pant") return 4;
    return 3;
  }
  if (item.category === "top" || item.category === "outer") {
    if (kind === "jersey" || kind === "athletic tee") return 1;
    if (kind === "polo") return tech ? 1.5 : 4;
    if (kind === "tee") return isGraphic(item) ? 2 : 3;
    if (kind === "hoodie" || kind === "sweatshirt") return tech || /soccer|team|harker|cal\b/.test(text) ? 1.5 : 2;
    if (kind === "sweater") {
      if (tech) return 1.5;
      return /short[- ]sleeve/.test(text) ? 4 : 3.5;
    }
    if (kind === "henley") return 3;
    if (kind === "shirt") return 4;
    if (kind === "jacket") return tech ? 1.5 : /shirt jacket|wool|overshirt|chore/.test(text) ? 4 : 3;
    if (kind === "coat") return 3.5;
    return Math.min(4, Math.max(1, item.formality));
  }
  return 3;
}

/**
 * How well the pieces agree on what kind of day it is. Gap is the spread of register
 * across top, bottom, layers, and shoes.
 */
export function coherenceScore(piecesIn: Item[], opts: { gym?: boolean; beach?: boolean } = {}) {
  const reasons: string[] = [];
  // At the beach flip-flops go with anything; they are not read against the clothes.
  const pieces = opts.beach ? piecesIn.filter((item) => item.category !== "shoes") : piecesIn;
  const levels = pieces.map(register);
  if (levels.length < 2) return { score: 0, reasons };
  const max = Math.max(...levels);
  const min = Math.min(...levels);
  const gap = max - min;
  let score = 0;

  if (gap <= 1) {
    score += 4;
  } else if (gap <= 2) {
    const bridged = levels.some((level) => level > min + 0.5 && level < max - 0.5);
    const quiet = pieces.every((item) => isNeutral(families(item).slice(0, 1)));
    if (!bridged && !quiet) score -= 4;
  } else if (gap <= 3) {
    score -= 12;
    reasons.push("Pieces from different days");
  } else {
    score -= 25;
    reasons.push("Pieces from different days");
  }

  const athletic = pieces.filter((item) => register(item) <= 1.5);
  if (athletic.length >= 3) {
    score -= opts.gym ? 0 : 15;
  } else if (athletic.length === 2 && !opts.gym) {
    score -= 8;
  }

  const shoe = pieces.find((item) => item.category === "shoes");
  if (shoe && max >= 4) {
    const kind = streetKind(shoe);
    if (kind === "runner") score -= 8;
    else if (kind === "sneaker" && register(shoe) <= 2) score -= 2;
  }

  return { score, reasons };
}
