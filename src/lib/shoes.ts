import type { Item } from "@prisma/client";
import { comboIds, comboKey } from "@/lib/combo";
import { families, hay, isNeutral, isShort } from "@/lib/garment";
import type { Occasion } from "@/lib/occasion";
import type { Recency } from "@/lib/rotation";
import type { Weather } from "@/lib/types";

export type ShoeKind = "sneaker" | "runner" | "sandal" | "clog" | "boot" | "dress shoe";

export function shoeKind(item: Item): ShoeKind {
  const text = hay(item);
  // A clog covers the toes: it is not a sandal, and the sandal weather rules do not apply.
  if (/\b(clog|clogs|mule|mules)\b|boston (vegan|clog|eva)|birkenstock boston/.test(text)) return "clog";
  if (/flip|sandal|slide|thong/.test(text)) return "sandal";
  if (/boot/.test(text)) return "boot";
  if (/loafer|derby|brogue|oxford|dress shoe/.test(text)) return "dress shoe";
  if (/runner|running|trainer|cleat/.test(text)) return "runner";
  return "sneaker";
}

/**
 * How a pair is worn off the track. A running shoe its owner wears as an everyday
 * sneaker (`wearAs: "sneaker"` in the piece's profile) is a sneaker everywhere except
 * the gym and the trail, where it is still a runner.
 */
export function streetKind(item: Item): ShoeKind {
  const kind = shoeKind(item);
  if (kind !== "runner") return kind;
  try {
    const profile = item.profile ? (JSON.parse(item.profile) as { wearAs?: string }) : null;
    if (profile?.wearAs === "sneaker") return "sneaker";
  } catch {
    /* an unreadable profile changes nothing */
  }
  return kind;
}

/** How well each kind of shoe suits the day, before weather and the clothes are read. */
function settingScore(kind: ShoeKind, occasion: Occasion, dressedUp: boolean, hotInShorts: boolean) {
  if (occasion.dressy) {
    return { "dress shoe": 14, boot: 4, sneaker: 0, runner: -14, clog: -18, sandal: -30 }[kind];
  }
  if (occasion.vibe === "beach") {
    return { sandal: 14, clog: 8, sneaker: 0, runner: -4, boot: -16, "dress shoe": -16 }[kind];
  }
  if (occasion.vibe === "gym") {
    return { runner: 20, sneaker: 0, boot: -20, "dress shoe": -20, clog: -30, sandal: -40 }[kind];
  }
  if (occasion.vibe === "hike") {
    return { runner: 10, boot: 10, sneaker: 0, "dress shoe": -20, clog: -24, sandal: -30 }[kind];
  }
  if (occasion.vibe === "travel") {
    return { sneaker: 6, runner: 6, boot: 0, clog: -2, "dress shoe": -8, sandal: -14 }[kind];
  }
  return {
    sneaker: 6,
    runner: 2,
    boot: 2,
    "dress shoe": dressedUp ? 4 : -6,
    // A clog is a slow-day shoe: fine with shorts or relaxed trousers, behind a sneaker by default.
    clog: dressedUp ? -6 : 3,
    // Flip-flops are for the beach and the pool, not the lecture hall.
    sandal: hotInShorts ? -8 : -14,
  }[kind];
}

/**
 * Reads one pair against the clothes it would be worn with. `climate` is the forecast
 * after the occasion has had its say. These are penalties, never exclusions: someone
 * who owns only flip-flops still leaves the house in them.
 */
export function shoeScore(
  shoe: Item,
  clothes: Item[],
  climate: Weather,
  occasion: Occasion,
  ignoreWeather = false,
) {
  const kind = shoeKind(shoe);
  const bottom = clothes.find((item) => item.category === "bottom");
  const shorts = bottom != null && isShort(bottom);
  const sharpest = Math.max(0, ...clothes.map((item) => item.formality));
  const hot = !ignoreWeather && climate.tempMax >= 78;
  const reasons: string[] = [];
  const sporty = occasion.vibe === "gym" || occasion.vibe === "hike";
  const worn = sporty ? kind : streetKind(shoe);
  let score = settingScore(worn, occasion, sharpest >= 4, hot && shorts);

  if (occasion.dressy) score += (shoe.formality - 2) * 4;
  else if (sharpest >= 4 && shoe.formality <= 1 && worn === kind) score -= 8;

  if (kind === "sandal" && occasion.vibe === "beach") reasons.push("Sandals for the sand");
  if (kind === "runner" && occasion.vibe === "gym") reasons.push("Runners for the gym");

  if (!ignoreWeather) {
    if (climate.precipProb >= 40) {
      if (!shoe.rainOk) score -= 12;
      if (kind === "sandal") score -= 20;
      if (shoe.rainOk && kind !== "sandal") reasons.push("Shoes that can take the rain");
    }
    if (kind === "sandal" && climate.tempMax < 60) score -= 24;
    if (hot && (kind === "boot" || shoe.warmth >= 3)) score -= 8;
  }

  if (bottom) {
    const beach = occasion.vibe === "beach";
    if (kind === "sandal" && !shorts && !beach) score -= /linen/.test(hay(bottom)) ? 8 : 20;
    if (kind === "dress shoe" && shorts) score -= 12;
    const top = clothes.find((item) => item.category === "top");
    if (kind === "sandal" && shorts && !beach && top && /polo|shirt|oxford/.test(hay(top))) score -= 8;
  }

  const colors = families(shoe);
  if (isNeutral(colors)) score += 2;
  else if (bottom && !isNeutral(families(bottom)) && !clothes.some((item) => families(item).some((c) => colors.includes(c)))) score -= 6;

  return { score, reasons };
}

/**
 * A look is known by its clothes. Skips, votes, and rotation all match on the stack
 * whatever was on the feet, so passing on a look does not bring the same clothes back in
 * other shoes, and votes cast before the closet had shoes still count.
 */
export function stackIds(ids: string[], shoeIds: Set<string>) {
  return ids.filter((id) => !shoeIds.has(id));
}

export function stackKey(key: string, shoeIds: Set<string>) {
  return comboKey(stackIds(comboIds(key), shoeIds));
}

export function withoutShoes(recency: Recency, shoeIds: Set<string>): Recency {
  const strip = (map: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [key, daysAgo] of Object.entries(map)) {
      const clothes = stackKey(key, shoeIds);
      out[clothes] = Math.min(out[clothes] ?? Infinity, daysAgo);
    }
    return out;
  };
  return {
    ...recency,
    combos: strip(recency.combos),
    shown: strip(recency.shown),
    turnedDown: strip(recency.turnedDown),
  };
}
