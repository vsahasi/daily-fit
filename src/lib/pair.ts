import type { Item } from "@prisma/client";
import { feelOf, planDay, type Band, type DayPlan } from "@/lib/bands";
import { classicScore } from "@/lib/classic";
import { BLACK_ON_BROWN, clashesWithBrown, isBlackShoe, shoeViolations, verdictForPlan, violationWeight, type Verdict } from "@/lib/climate";
import { comboKey } from "@/lib/combo";
import { families, hay, isShort } from "@/lib/garment";
import { houseScore } from "@/lib/house";
import { isTechnical, layerRole, pieceKind } from "@/lib/kinds";
import { isMidKind, isOpenShirt, isShellKind, layerKind, removableRank, stackVerdict } from "@/lib/layering";
import { likeScore, type Likes } from "@/lib/likes";
import { everydayOccasion, type Occasion } from "@/lib/occasion";
import { paletteScore, shoePaletteScore } from "@/lib/palette";
import { coherenceScore, register } from "@/lib/register";
import { rotationScore, type Recency } from "@/lib/rotation";
import { shoeScore, stackIds, stackKey, withoutShoes } from "@/lib/shoes";
import type { Weather } from "@/lib/types";

export type ScoredLook = {
  itemIds: string[];
  score: number;
  reason: string;
  /** Set when the look breaks a forecast rule and only went out because nothing else was clean. */
  blocked?: string;
  /** Set when the look repeats a piece from a look turned down today. */
  avoided?: boolean;
};

export type LookPref = {
  liked: string[][];
  passed: string[][];
};

function occasions(item: Item) {
  try {
    const profile = item.profile ? (JSON.parse(item.profile) as { occasions?: string[] }) : null;
    return (profile?.occasions ?? []).map((tag) => tag.toLowerCase());
  } catch {
    return [];
  }
}

function loudness(item: Item) {
  const pattern = `${item.pattern ?? ""} ${item.name}`.toLowerCase();
  if (pieceKind(item) === "jersey" || /stripe|graphic|windowpane|plaid/.test(pattern)) return 2;
  if (/check|dot|pinstripe/.test(pattern)) return 1;
  return 0;
}

function isSweat(item: Item) {
  return /hoodie|sweatshirt|sweatpant|jogger|fleece/.test(hay(item));
}

/** Made for sport: a jersey, Dri-Fit, performance fabric. "Cotton jersey" is a fabric, not a jersey. */
function isAthletic(item: Item) {
  return ["jersey", "athletic tee", "athletic short"].includes(pieceKind(item)) || /dri-fit|dri fit|performance|soccer|athletic/.test(hay(item));
}

/**
 * The forecast after the occasion has had its say, read from daily numbers rather than
 * the hourly day. An evening or a night is the cool end of the day: the 7pm felt
 * number, and for a late night the slide from there toward the overnight low.
 * Temperatures the line states win over the coarse "hot" and "cold" words.
 */
export function weatherForOccasion(weather: Weather, occasion: Occasion): Weather {
  const { when, temps, climate } = occasion;
  if (climate === "forecast" && !temps && when !== "evening" && when !== "night") return weather;
  const { feel, feelsMax, feelsMin, outHigh, outLow, morning, windMax, ...daily } = weather;
  void feel; void feelsMax; void feelsMin; void outHigh; void outLow; void morning; void windMax;
  let out: Weather = daily;
  if (when === "evening" || when === "night") {
    const evening = feelOf(weather).eveningEff;
    const later = Math.round((evening + weather.tempMin) / 2);
    const high = when === "evening" ? evening : later;
    const low = when === "evening" ? later : weather.tempMin;
    // No sun after dark either way: a clear code keeps the day read from docking five more for cloud.
    out = { ...out, tempMax: Math.max(high, low), tempMin: Math.min(high, low), code: weather.code <= 3 ? 1 : weather.code };
  }
  if (temps) return { ...out, tempMax: temps.high, tempMin: temps.low };
  if (climate === "hot") {
    return { ...out, tempMax: Math.max(84, out.tempMax), tempMin: Math.max(70, out.tempMin), summary: "warm", code: 0, precipProb: 0 };
  }
  if (climate === "cold") {
    return { ...out, tempMax: Math.min(52, out.tempMax), tempMin: Math.min(40, out.tempMin), summary: "cold" };
  }
  return out;
}

/** Soft warmth targets by band: the sum of warmth across the clothes, shoes aside. */
const WARMTH_BY_BAND: Record<Band, { min: number; max: number }> = {
  scorching: { min: 2, max: 4 },
  hot: { min: 2, max: 5 },
  warm: { min: 3, max: 6 },
  mild: { min: 4, max: 7 },
  cool: { min: 6, max: 9 },
  cold: { min: 8, max: 12 },
  freezing: { min: 12, max: 15 },
};

function hash(value: string) {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) n = (n * 31 + value.charCodeAt(i)) >>> 0;
  return n;
}

/** A piece's name without the brand run-up, for a reason line: "the fleece jacket", not the catalogue entry. */
function short(name: string) {
  const words = name.split(" ");
  return words.length > 3 ? `The ${words.slice(-2).join(" ").toLowerCase()}` : `The ${name.toLowerCase()}`;
}

const asLayerCache = new WeakMap<Item, Item>();

/** A sweatshirt or hoodie cataloged as a top, worn over a base: read it as a layer. */
export function asLayer(item: Item): Item {
  if (item.category === "outer") return item;
  const cached = asLayerCache.get(item);
  if (cached) return cached;
  const copy = { ...item, category: "outer" };
  asLayerCache.set(item, copy);
  return copy;
}

/**
 * A look as a stack: one base top, one bottom, then layers inner to outer. A second
 * cataloged top in a look is a mid layer over the first.
 */
export function normalizeStack(pieces: Item[]) {
  const tops = pieces.filter((item) => item.category === "top");
  // With a tee and a shirt both in the look, the tee is the base and the shirt is worn open over it.
  const base =
    tops.find((item) => layerRole(item) === "base" && !["shirt", "linen shirt"].includes(layerKind(item))) ??
    tops.find((item) => layerRole(item) === "base") ??
    tops[0];
  const extraTops = tops.filter((item) => item !== base);
  const rest = pieces.filter((item) => item.category !== "top" && item.category !== "outer");
  const outers = pieces.filter((item) => item.category === "outer");
  const mids = extraTops.map(asLayer);
  const layers = [...mids, ...outers].sort((a, b) => Number(isShellKind(a)) - Number(isShellKind(b)));
  return { top: base, bottom: rest.find((item) => item.category === "bottom"), layers, rest, all: [...(base ? [base] : []), ...rest, ...layers] };
}

function fitScore(top: Item, bottom: Item) {
  const tf = (top.fit ?? "").toLowerCase();
  const bf = (bottom.fit ?? "").toLowerCase();
  const soft = /fleece|sweat|jogger/.test(hay(bottom));
  if ((tf.includes("athletic") || tf.includes("slim") || tf.includes("regular")) && (bf.includes("relax") || bf.includes("straight") || bf.includes("regular"))) return 4;
  if ((tf.includes("relax") || tf.includes("oversize")) && (bf.includes("slim") || bf.includes("taper") || bf.includes("straight"))) return 4;
  if ((tf.includes("relax") || tf.includes("oversize")) && (bf.includes("relax") || bf.includes("oversize"))) return soft ? -4 : -1;
  if (tf.includes("athletic") && (bf.includes("wide") || bf.includes("relax"))) return -2;
  return 1;
}

/** Only for a named dressy occasion: everyday coherence is read from register. */
function dressyBalance(items: Item[], occasion: Occasion) {
  const values = items.map((item) => item.formality);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const peak = values.reduce((sum, n) => sum + n, 0) / values.length;
  const reasons: string[] = [];
  let score = 0;

  {
    const distance = Math.abs(peak - occasion.targetFormality);
    score += Math.max(-12, 12 - distance * 6);
    if (max < occasion.targetFormality) {
      score -= (occasion.targetFormality - max) * 8;
    }
    for (const item of items) {
      if (item.formality < occasion.targetFormality - 1) score -= 6;
    }
    if (max >= occasion.targetFormality - 1) {
      reasons.push(`Dressed for ${occasion.label}`);
    }
    if (max >= 4 && min <= 3 && occasion.targetFormality < 4) {
      score += 8;
      reasons.push("The sharp piece sits next to something calmer");
    } else if (max >= 4 && min >= 4 && occasion.targetFormality <= 3) {
      score -= 6;
    }
  }

  if (max >= 4) {
    const bottom = items.find((item) => item.category === "bottom");
    if (bottom) {
      if (/cargo|carpenter|work pant|drawstring|linen|athletic|performance|puma|sweatpant|jogger/.test(hay(bottom))) score -= 14;
    }
  }

  return { score, reasons };
}

function occasionScore(items: Item[], occasion: Occasion) {
  if (occasion.label === "everyday") return 0;
  const hits = items.filter((item) => occasions(item).some((tag) => occasion.tags.includes(tag))).length;
  return hits * 5;
}

function vibeScore(items: Item[], occasion: Occasion) {
  const top = items.find((item) => item.category === "top");
  const bottom = items.find((item) => item.category === "bottom");
  const outer = items.filter((item) => item.category === "outer").at(-1);
  const reasons: string[] = [];
  let score = 0;

  if (occasion.vibe === "beach") {
    for (const item of items) {
      if (isSweat(item) || item.warmth >= 4) score -= 30;
    }
    if (outer) score -= 20;
    if (bottom && isShort(bottom)) {
      score += 16;
      reasons.push("Shorts for the sand");
    }
    if (bottom && /linen/.test(hay(bottom))) score += 10;
    if (bottom && !isShort(bottom) && /sweatpant|jogger|work pant|cargo pant|chino/.test(hay(bottom))) {
      score -= 22;
    }
    if (top && /tee/.test(hay(top)) && !isAthletic(top) && loudness(top) < 2) score += 10;
    if (top && /polo|sweater/.test(hay(top))) score -= 8;
    if (top && /hoodie|sweater|quarter-zip|henley/.test(hay(top))) score -= 22;
    if (top && (pieceKind(top) === "jersey" || /soccer/.test(hay(top)))) score -= 8;
  }

  if (occasion.vibe === "gym") {
    // The gym is a kit: an athletic top, athletic shorts or sweats. Street clothes stay out.
    if (top && isAthletic(top)) score += 12;
    else if (top) score -= 8;
    if (bottom) {
      const kind = pieceKind(bottom);
      if (kind === "athletic short" || kind === "sweatpant") score += 10;
      else if (isShort(bottom)) score -= 30;
      else score -= 40;
      // A jersey over athletic shorts is a mistake on campus and exactly right here.
      if (top && pieceKind(top) === "jersey" && kind === "athletic short") score += 15;
    }
    if (top && ["polo", "shirt"].includes(pieceKind(top))) score -= 40;
    for (const layer of items.filter((item) => item.category === "outer")) {
      if (!isTechnical(layer) && !/hoodie|sweatshirt/.test(hay(layer))) score -= 12;
    }
  }

  if (occasion.vibe === "hike") {
    // A trail wants things that can get dirty and layers built for moving.
    const topKind = top ? pieceKind(top) : "";
    if (top && (["tee", "athletic tee", "hoodie", "henley"].includes(topKind) || isAthletic(top))) score += 6;
    if (top && ["sweater", "polo", "shirt"].includes(topKind) && !isAthletic(top)) score -= 14;
    if (top && topKind === "jersey") score -= 10;
    if (bottom) {
      const kind = pieceKind(bottom);
      if (isShort(bottom) || ["cargo pant", "work pant", "sweatpant"].includes(kind)) score += 6;
      if (["chino", "dress pant", "linen pant"].includes(kind) || /corduroy/.test(hay(bottom))) score -= 20;
    }
    if (outer) {
      const kind = layerKind(outer);
      if (["fleece jacket", "zip shell", "perf quarter-zip", "hoodie", "zip hoodie"].includes(kind)) score += 8;
      if (["shirt jacket", "bomber", "coat"].includes(kind)) score -= 12;
    }
  }

  return { score, reasons };
}

function prefScore(ids: string[], pref?: LookPref) {
  if (!pref) return 0;
  const key = comboKey(ids);
  for (const passed of pref.passed) {
    if (comboKey(passed) === key) return -28;
  }
  return 0;
}

export function scoreLook(
  pieces: Item[],
  weather: Weather,
  occasion: Occasion,
  dateKey: string,
  pref?: LookPref,
  ignoreWeather = false,
  likes?: Likes,
  recency?: Recency,
) {
  // The clothes are judged as a stack. The pair on the feet is judged against that stack,
  // and stays out of its warmth and formality sums.
  const shoes = pieces.find((item) => item.category === "shoes");
  const stack = normalizeStack(pieces.filter((item) => item.category !== "shoes"));
  const { top, bottom, layers } = stack;
  const items = stack.all;
  const extras = items.filter((item) => item.category === "accessory");
  if (!top || !bottom) return { score: -999, reasons: ["Need a top and a bottom"] };
  void dateKey;

  const gym = occasion.vibe === "gym";
  const climate = weatherForOccasion(weather, occasion);
  const plan = planDay(climate, { gym });
  const warmth = items.reduce((sum, item) => sum + item.warmth, 0);
  const outermost = layers[layers.length - 1];
  const reasons: string[] = [];
  let score = 50;

  const palette = paletteScore(items);
  score += palette.score;
  reasons.push(...palette.reasons);
  const classic = classicScore(top, bottom, layers);
  score += classic.score;
  reasons.push(...classic.reasons);
  const fit = fitScore(top, bottom);
  score += fit;
  const worn = shoes ? [...items, shoes] : items;
  const coherence = coherenceScore(worn, { gym, beach: occasion.vibe === "beach" });
  score += coherence.score;
  reasons.push(...coherence.reasons);
  const stacked = stackVerdict(top, layers);
  if (stacked.ok) {
    score += stacked.score;
    reasons.push(...stacked.reasons);
  } else {
    score -= 40;
  }
  if (occasion.dressy) {
    const dressy = dressyBalance(items, occasion);
    score += dressy.score;
    reasons.push(...dressy.reasons);
  }
  const vibe = vibeScore(items, occasion);
  score += vibe.score;
  reasons.push(...vibe.reasons);
  score += occasionScore(items, occasion);
  score += prefScore(
    items.map((item) => item.id),
    pref,
  );
  const liked = likeScore(worn, likes);
  score += liked.score;
  reasons.push(...liked.reasons);
  const rotation = rotationScore(worn, recency);
  score += rotation.score;
  reasons.push(...rotation.reasons);
  // The house rules hold on ordinary days and relaxed occasions; the gym and formal days have their own.
  if (!gym && !(occasion.dressy && occasion.targetFormality >= 4)) {
    const house = houseScore(top, plan, recency, bottom);
    score += house.score;
    reasons.push(...house.reasons);
  }

  if (!ignoreWeather) {
    const need = WARMTH_BY_BAND[plan.band];
    // The gym warms itself: no warmth floor, and no credit for a layer the day does not ask for.
    if (!gym && warmth < need.min) score -= (need.min - warmth) * 3;
    if (warmth > need.max) score -= (warmth - need.max) * 2;
    const layerWanted = plan.layers.min >= 1 || plan.trigger || plan.insulation !== "none";
    if (outermost && isOpenShirt(outermost)) {
      // A good look once in a while, not a default: it costs a little, and more in real heat.
      score -= plan.airHigh >= 80 ? 12 : 8;
      reasons.push(`${short(outermost.name)} worn open over the tee`);
    }
    if (layers.length && !gym && layerWanted && (plan.high <= 74 || (plan.trigger && plan.layers.removable))) {
      score += 6;
      const piece = short(outermost!.name);
      if (plan.rainTier >= 2) {
        reasons.unshift(`${piece} for the rain`);
      } else if (plan.windMax >= 12) {
        reasons.unshift(`${piece} against the ${plan.windMax} mph wind`);
      } else if (plan.wet) {
        reasons.unshift(`${piece} for the drizzle`);
      } else if (occasion.when === "night" || occasion.when === "evening") {
        // The brief is the evening itself: the layer is for its temperature, not a morning.
        reasons.unshift(`${piece} for the ${climate.tempMax}° ${occasion.when}`);
      } else if (/dinner|evening|night|date|party/i.test(occasion.label)) {
        reasons.unshift(`${piece} for the ${plan.evening}° evening`);
      } else if (plan.trigger && plan.layers.removable) {
        reasons.unshift(plan.overcast ? `${piece} for the ${plan.dawn}° morning` : `${piece} for the ${plan.dawn}° morning, off by 10am`);
      } else {
        reasons.unshift(layers.length === 2 ? `A mid layer and ${piece.toLowerCase()} for the ${plan.dawn}° morning` : `${piece} for the ${plan.dawn}° morning`);
      }
    }
    if (layers.length && gym) score -= isShort(bottom) ? 12 : 4;
    if (plan.rainTier >= 2 && !bottom.rainOk) score -= 8;
    if (plan.layers.removable && outermost) score += removableRank(outermost, plan.airHigh, plan.rainTier >= 1 || plan.windMax >= 12) ?? -4;
    // When it is properly cold the base matters: a long sleeve, better a thermal, under the layers.
    if (plan.lowEff <= 45) {
      score += /thermal|waffle/.test(hay(top)) ? 5 : top.warmth >= 2 && /long/.test(`${top.name} ${top.silhouette ?? ""}`.toLowerCase()) ? 3 : top.warmth <= 1 ? (plan.lowEff <= 40 ? -8 : -3) : 0;
    }
    // A track jacket is the right outer piece in rain or wind, and a weak one otherwise.
    if (outermost && isTechnical(outermost) && !gym && plan.rainTier === 0 && plan.windMax < 12) score -= 4;

    // In the heat the lightest top wins ties: a tee over a knit polo, a knit polo over a sweater.
    if (plan.sleeves === "short") {
      score += (2 - top.warmth) * 3;
      if (plan.airHigh >= 80 && bottom.warmth >= 3) score -= 8;
    }
    if (isShort(bottom) && plan.shorts !== "no" && occasion.allowShorts) {
      score += 4;
      if (plan.high >= 78) reasons.push("Shorts for the heat");
    }
    if (plan.band === "scorching" && !isShort(bottom)) score -= 4;
    if (plan.rainTier === 1 && outermost && !outermost.rainOk) score -= 4;
    if (plan.rainTier >= 1 && !outermost && plan.band !== "hot" && plan.band !== "scorching") score -= 2;
  } else if (outermost && occasion.dressy && outermost.formality <= 2) {
    score -= 8;
  }

  if (occasion.vibe === "everyday") {
    if (/sweatpant|jogger/.test(hay(bottom))) score -= 6;
    if (pieceKind(bottom) === "dress pant") score -= 25;
    if (isTechnical(top) && isTechnical(bottom) && plan.airHigh < 85) score -= 6;
    if (pieceKind(bottom) === "athletic short" && ["jersey", "athletic tee"].includes(pieceKind(top))) score -= 8;
  }

  if (occasion.dressy) {
    if (occasion.targetFormality >= 4 && top.formality >= 4) score += 10;
    else if (bottom.formality >= 4 && top.formality <= 3) score -= 8;
    const text = hay(top);
    const dressKind = pieceKind(top);
    const formal = occasion.targetFormality >= 4;
    // A shirt is the dressy top. A polo is a step down, a performance polo is not dressy at all.
    if (dressKind === "shirt") score += formal ? 14 : 8;
    else if (dressKind === "polo") score += isTechnical(top) ? -14 : formal ? -25 : 3;
    else if (["henley", "tee", "jersey", "hoodie", "athletic tee", "sweatshirt"].includes(dressKind)) score -= formal ? 30 : 4;
    if (formal && register(bottom) < 4) score -= 20;
    if (outermost && layerKind(outermost) === "fleece jacket") score -= 12;
    // The dress pant was held back as everyday filler; here it is the point.
    if (pieceKind(bottom) === "dress pant" && dressKind === "shirt") score += 8;
    if (/\b(interview|office|meeting|presentation|conference)\b/i.test(occasion.label)) {
      if (/(oxford|button-down|button-up)/.test(text)) score += 8;
      if (/(linen|short-sleeve shirt)/.test(text) && !/oxford/.test(text)) score -= 8;
      if (bottom && /dress pant/.test(hay(bottom))) score += 6;
    }
    if (/\b(wedding|funeral|gala|graduation|church)\b/i.test(occasion.label)) {
      // Be honest when the closet cannot do it: no jacket, no dress shoes.
      if (!shoes || register(shoes) < 4) reasons.unshift("The closest this closet gets: it has no blazer or dress shoes");
      if (/(oxford|button-down|button-up)/.test(text)) score += 12;
      if (/(linen|short-sleeve shirt)/.test(text) && !/oxford/.test(text)) score -= 10;
      if (bottom && /dress pant/.test(hay(bottom))) score += 8;
    }
    if (outermost && (outermost.formality <= 2 || isTechnical(outermost))) score -= isTechnical(outermost) ? 20 : 8;
  }

  if (isShort(bottom) && !occasion.allowShorts) score -= 18;

  extras.forEach((extra) => {
    score += families(extra).some((c) => families(top).includes(c)) ? 2 : -2;
  });
  if (shoes) {
    const feet = shoeScore(shoes, items, climate, occasion, ignoreWeather);
    score += feet.score + shoePaletteScore(shoes, items);
    reasons.push(...feet.reasons);
  }

  if (fit >= 4) reasons.push("The fit contrast holds");
  if (!reasons.length) reasons.push("Clean, wearable, in the clothes you own");

  return { score, reasons };
}

/** How many of the leading stacks get shoes. Shoes never change which clothes win, so the tail can go bare. */
const DRESS_LIMIT = 120;

function collectLooks(opts: {
  items: Item[];
  weather: Weather;
  skippedCombos: string[];
  /** Pieces from looks turned down today. "Another look" means another top and another bottom. */
  avoidItems?: string[];
  occasion: Occasion;
  dateKey: string;
  pref?: LookPref;
  ignoreWeather?: boolean;
  likes?: Likes;
  recency?: Recency;
}) {
  const available = opts.items.filter((item) => item.status === "available" && item.imagePath);
  const tops = available.filter((item) => item.category === "top");
  const bottoms = available.filter((item) => item.category === "bottom");
  const outers = available.filter((item) => item.category === "outer");
  const shoes = available.filter((item) => item.category === "shoes");
  // What was skipped, passed, or worn is matched on the clothes, whatever shoes went with them.
  const shoeIds = new Set(opts.items.filter((item) => item.category === "shoes").map((item) => item.id));
  const skipped = new Set(opts.skippedCombos.map((key) => stackKey(key, shoeIds)));
  const avoid = new Set(opts.avoidItems ?? []);
  const pref = opts.pref && {
    liked: opts.pref.liked,
    passed: opts.pref.passed.map((ids) => stackIds(ids, shoeIds)),
  };
  const recency = opts.recency && withoutShoes(opts.recency, shoeIds);
  const gym = opts.occasion.vibe === "gym";
  const climate = weatherForOccasion(opts.weather, opts.occasion);
  const plan = planDay(climate, { gym });
  const ignoreWeather = Boolean(opts.ignoreWeather);
  const rules = { gym, formal: opts.occasion.dressy && opts.occasion.targetFormality >= 4 };

  // The layers on offer: mids over a base top, shells over anything, both when the day asks.
  const mids = [
    ...outers.filter((item) => isMidKind(item) || layerRole(item) === "mid"),
    ...tops.filter((item) => layerRole(item) === "mid").map(asLayer),
  ].filter((item) => item.warmth <= plan.layers.maxWarmth);
  const shells = outers
    .filter((item) => isShellKind(item))
    .filter((item) => item.warmth <= plan.layers.maxWarmth || (plan.band === "cool" && layerKind(item) === "shirt jacket"));
  const maxLayers = ignoreWeather ? 0 : plan.layers.max;
  const openShirts = tops.filter((item) => ["shirt", "linen shirt"].includes(layerKind(item))).map(asLayer);
  const legalPairs = ignoreWeather ? shoes : shoes.filter((pair) => !shoeViolations(pair, plan).length);
  const onlyBlackShoes = legalPairs.length > 0 && legalPairs.every(isBlackShoe);

  // avoided: 2 when the top or bottom was turned down today, 1 when only a layer was, 0 when all is fresh.
  type Candidate = { clothes: Item[]; verdict: Verdict; avoided: number; weight: number };
  const candidates: Candidate[] = [];
  for (const top of tops) {
    const base = layerRole(top) === "base";
    const options: Item[][] = [[]];
    if (maxLayers >= 1) {
      if (base) for (const mid of mids) if (mid.id !== top.id) options.push([mid]);
      for (const shell of shells) options.push([shell]);
    }
    // A shirt worn open over a tee: any day a layer is allowed, and a short-sleeve linen one in the heat.
    if (!ignoreWeather && ["tee", "ls tee", "graphic tee"].includes(layerKind(top))) {
      for (const shirt of openShirts) {
        if (shirt.id === top.id) continue;
        const breezy = /linen/.test(hay(shirt)) && /short/.test(hay(shirt)) && plan.airHigh >= 71;
        if (maxLayers >= 1 || breezy) options.push([shirt]);
      }
    }
    if (maxLayers >= 2 && base) {
      for (const mid of mids) {
        if (mid.id === top.id) continue;
        for (const shell of shells) options.push([mid, shell]);
      }
    }
    for (const bottom of bottoms) {
      for (const layers of options) {
        const clothes = [top, bottom, ...layers];
        if (skipped.has(comboKey(clothes.map((item) => item.id)))) continue;
        let verdict: Verdict = ignoreWeather ? { ok: true } : verdictForPlan(clothes, plan, rules);
        // Every pair the day allows is black and the trousers are brown: his rule says no.
        const brownClash = !gym && onlyBlackShoes && clashesWithBrown(legalPairs[0], bottom);
        if (brownClash && verdict.ok) verdict = { ok: false, why: BLACK_ON_BROWN.why };
        // "Another look" means another top and another bottom. The one jacket the day needs may stay.
        candidates.push({
          clothes,
          verdict,
          avoided: avoid.has(top.id) || avoid.has(bottom.id) ? 2 : layers.some((item) => avoid.has(item.id)) ? 1 : 0,
          weight: verdict.ok ? 0 : (ignoreWeather ? 0 : violationWeight(clothes, plan, rules)) + (brownClash ? BLACK_ON_BROWN.weight : 0),
        });
      }
    }
  }

  // A look that breaks a forecast rule is out, unless nothing clean passes. A look that
  // repeats a piece turned down today is out, unless that is all that is left.
  const passing = candidates.filter((row) => row.verdict.ok);
  const fresh = passing.filter((row) => row.avoided === 0);
  const freshClothes = passing.filter((row) => row.avoided <= 1);
  // When nothing passes, the look that breaks the least goes out: a jacket that is not rain-safe
  // beats shorts in the cold, and that beats no jacket at all.
  const least = passing.length ? 0 : Math.min(...candidates.map((row) => row.weight), Infinity);
  const leastBad = candidates.filter((row) => row.weight <= least + 1);
  const pool = fresh.length ? fresh : freshClothes.length ? freshClothes : passing.length ? passing : leastBad.length ? leastBad : candidates;

  const score = (pieces: Item[]) => ({
    pieces,
    ...scoreLook(pieces, opts.weather, opts.occasion, opts.dateKey, pref, ignoreWeather, opts.likes, recency),
  });
  // Shoes follow the clothes, with one exception: when every pair the day allows fights the
  // trousers (a black shoe under brown), those trousers are the wrong call today.
  const legalShoes = () => legalPairs;
  const shoeDrag = (clothes: Item[]) => {
    const pairs = legalPairs;
    const pick = pairs.length ? pairs : shoes;
    if (!pick.length) return 0;
    return Math.min(0, Math.max(...pick.map((pair) => shoePaletteScore(pair, clothes)))) <= -10 ? -14 : 0;
  };
  const scored = pool
    .map((row) => {
      const bare = score(row.clothes);
      // A small nudge that changes with the date, so the same closet on the same forecast
      // does not open with the same look every time. It only ever breaks near-ties.
      const nudge = (hash(`${opts.dateKey}|${comboKey(row.clothes.map((item) => item.id))}`) % 9) - 4;
      return { ...row, bare, rank: bare.score + shoeDrag(row.clothes) + nudge };
    })
    .sort((a, b) => b.rank - a.rank);

  // Shoes follow the clothes. A stack is ranked on the clothes alone, then goes out in
  // whichever clean pair suits it best, so owning shoes never changes which clothes win.
  const looks: ScoredLook[] = [];
  for (const row of scored.slice(0, DRESS_LIMIT)) {
    // The pair has to pass the forecast too: no knit shoes in the rain, no flip-flops in the cold.
    const bottomPiece = row.clothes.find((item) => item.category === "bottom")!;
    const calm = legalShoes().filter((pair) => !clashesWithBrown(pair, bottomPiece));
    const legal = calm.length ? calm : legalShoes();
    const wearable = legal.length ? legal : shoes;
    const dressed = wearable.length
      ? wearable.map((pair) => score([...row.clothes, pair])).reduce((best, next) => (next.score > best.score ? next : best))
      : row.bare;
    looks.push({
      itemIds: dressed.pieces.map((item) => item.id),
      score: row.rank,
      reason: caption(
        dressed.pieces,
        opts.weather,
        opts.occasion,
        row.verdict.ok ? dressed.reasons : [`${row.verdict.why}, and nothing clean does better`],
        ignoreWeather,
      ),
      ...(row.verdict.ok ? {} : { blocked: row.verdict.why }),
      ...(row.avoided === 2 ? { avoided: true } : {}),
    });
  }
  return looks;
}

function diversify(looks: ScoredLook[], items: Item[], limit: number) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const picked: ScoredLook[] = [];
  const topCounts = new Map<string, number>();
  const bottomCounts = new Map<string, number>();
  const layerCounts = new Map<string, number>();
  // A list is a spread: no top or trouser more than twice, no jacket in more than about a third,
  // and nothing far below the best. A small closet loosens the trouser cap rather than run short.
  const floor = (looks[0]?.score ?? 0) - 40;
  const bottoms = new Set(
    looks.map((look) => look.itemIds.find((id) => byId.get(id)?.category === "bottom")).filter(Boolean),
  ).size;
  const bottomCap = Math.max(2, Math.ceil(limit / Math.max(1, bottoms)));
  const layerOf = (look: ScoredLook) => look.itemIds.filter((id) => byId.get(id)?.category === "outer");
  const distinctLayers = new Set(looks.flatMap(layerOf)).size;
  // One or two jackets in the whole pool (a rain day with one shell) cannot be spread: let them repeat.
  const layerCap = distinctLayers <= 2 ? limit : Math.max(2, Math.ceil(limit * 0.4));

  for (const look of looks) {
    const pieces = look.itemIds.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
    const top = pieces.find((item) => item.category === "top");
    const bottom = pieces.find((item) => item.category === "bottom");
    const layers = pieces.filter((item) => item.category === "outer" || (item.category === "top" && item !== top));
    if (!top || !bottom) continue;
    if (look.score < floor && picked.length >= 5) break;
    if ((topCounts.get(top.id) ?? 0) >= 2) continue;
    if ((bottomCounts.get(bottom.id) ?? 0) >= bottomCap) continue;
    if (!look.blocked && layers.some((layer) => (layerCounts.get(layer.id) ?? 0) >= layerCap)) continue;
    if (picked.some((row) => comboKey(row.itemIds) === comboKey(look.itemIds))) continue;
    picked.push(look);
    topCounts.set(top.id, (topCounts.get(top.id) ?? 0) + 1);
    bottomCounts.set(bottom.id, (bottomCounts.get(bottom.id) ?? 0) + 1);
    for (const layer of layers) layerCounts.set(layer.id, (layerCounts.get(layer.id) ?? 0) + 1);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function rankLooks(opts: {
  items: Item[];
  weather: Weather;
  skippedCombos: string[];
  occasion?: Occasion;
  dateKey: string;
  pref?: LookPref;
  limit?: number;
  ignoreWeather?: boolean;
  likes?: Likes;
  recency?: Recency;
}): ScoredLook[] {
  const occasion = opts.occasion ?? everydayOccasion();
  const looks = collectLooks({ ...opts, occasion });
  return diversify(looks, opts.items, opts.limit ?? 16);
}

export function pickLook(opts: {
  items: Item[];
  weather: Weather;
  skippedCombos: string[];
  occasion?: Occasion;
  dateKey: string;
  pref?: LookPref;
  likes?: Likes;
  /** What was worn, shown, or turned down lately. Today passes it; the Looks deck does not. */
  recency?: Recency;
  avoidItems?: string[];
}): ScoredLook {
  const occasion = opts.occasion ?? everydayOccasion();
  const looks = collectLooks({ ...opts, occasion });
  const best = looks[0];
  if (!best) {
    throw new Error("Need at least one clean top and one clean bottom");
  }
  return best;
}

/**
 * Trades one piece of a look for the best other clean piece in that slot, keeping the rest.
 * Pieces already tried in that slot today are out, unless nothing else is clean.
 */
export function swapPiece(opts: {
  items: Item[];
  weather: Weather;
  occasion?: Occasion;
  dateKey: string;
  current: string[];
  itemId: string;
  avoidItems?: string[];
  pref?: LookPref;
  likes?: Likes;
  recency?: Recency;
  ignoreWeather?: boolean;
}): ScoredLook {
  const occasion = opts.occasion ?? everydayOccasion();
  const byId = new Map(opts.items.map((item) => [item.id, item]));
  const current = opts.current.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
  const leaving = byId.get(opts.itemId);
  if (!leaving || !current.some((item) => item.id === leaving.id)) {
    throw new Error("That piece is not in this look");
  }
  const avoid = new Set([...(opts.avoidItems ?? []), ...opts.current]);
  const clean = opts.items.filter((item) => item.status === "available" && item.imagePath);
  // A layer is traded for a layer: a mid or a jacket, never a tee. Everything else is traded in kind.
  const stack = normalizeStack(current.filter((item) => item.category !== "shoes"));
  const isLayer = leaving.category === "outer" || (leaving.category === "top" && stack.top?.id !== leaving.id);
  const candidates = isLayer
    ? clean.filter((item) => item.category === "outer" || (item.category === "top" && layerRole(item) === "mid"))
    : clean.filter((item) => item.category === leaving.category);
  const fresh = candidates.filter((item) => !avoid.has(item.id));
  const pool = fresh.length ? fresh : candidates.filter((item) => !opts.current.includes(item.id));
  if (!pool.length) throw new Error(`Nothing else clean to wear instead of ${leaving.name}`);

  const shoeIds = new Set(opts.items.filter((item) => item.category === "shoes").map((item) => item.id));
  const recency = opts.recency && withoutShoes(opts.recency, shoeIds);
  const climate = weatherForOccasion(opts.weather, occasion);
  const gym = occasion.vibe === "gym";
  const plan = planDay(climate, { gym });
  const ignoreWeather = Boolean(opts.ignoreWeather);
  const rules = { gym, formal: occasion.dressy && occasion.targetFormality >= 4 };
  const scored = pool.map((candidate) => {
    const pieces = current.map((item) => (item.id === leaving.id ? candidate : item));
    const clothes = pieces.filter((item) => item.category !== "shoes");
    const feet = pieces.filter((item) => item.category === "shoes");
    const verdict: Verdict = ignoreWeather ? { ok: true } : verdictForPlan([...normalizeStack(clothes).all, ...feet], plan, rules);
    const result = scoreLook(pieces, opts.weather, occasion, opts.dateKey, opts.pref, ignoreWeather, opts.likes, recency);
    const weight = verdict.ok ? 0 : violationWeight([...normalizeStack(clothes).all, ...feet], plan, rules);
    return { pieces, verdict, weight, ...result };
  });
  // The best legal trade; failing that, the one that breaks the least.
  scored.sort((a, b) => a.weight - b.weight || b.score - a.score);
  const best = scored[0];
  const before = ignoreWeather ? 0 : violationWeight([...normalizeStack(current.filter((item) => item.category !== "shoes")).all, ...current.filter((item) => item.category === "shoes")], plan, rules);
  // Trading shoes for a pair the day rules out (flip-flops in the rain) is no trade at all.
  if (leaving.category === "shoes" && best.weight - before >= 7) throw new Error(`Nothing else clean to wear instead of ${leaving.name}`);
  return {
    itemIds: best.pieces.map((item) => item.id),
    score: best.score,
    reason: caption(
      best.pieces,
      climate,
      occasion,
      best.verdict.ok ? best.reasons : [`${best.verdict.why}, and nothing clean does better`],
      ignoreWeather,
    ),
    ...(best.verdict.ok ? {} : { blocked: best.verdict.why }),
  };
}

function caption(
  items: Item[],
  weather: Weather,
  occasion: Occasion,
  reasons: string[],
  ignoreWeather = false,
) {
  const names = items.map((item) => item.name);
  const why = reasons[0] ?? "Clean, wearable, in the clothes you own";
  if (ignoreWeather) {
    if (occasion.label === "everyday") return `${names.join(", ")}. ${why}.`;
    return `${names.join(", ")}. ${occasion.label}. ${why}.`;
  }
  const climate = weatherForOccasion(weather, occasion);
  const plan: DayPlan = planDay(climate);
  const morning = plan.dawn;
  const weatherBit =
    occasion.when === "night" || occasion.when === "evening"
      ? `${climate.tempMax}° ${occasion.when === "night" ? "tonight" : "this evening"}, ${weather.summary}`
      : occasion.temps
        ? `${climate.tempMax}° by your count`
        : occasion.climate === "hot"
          ? "dressed for heat"
          : occasion.climate === "cold"
            ? "dressed for cold"
            : plan.trigger || weather.tempMax < 72
              ? `${weather.tempMax}° after a ${morning}° morning, ${weather.summary}`
              : `${weather.tempMax}° and ${weather.summary}`;
  const eventBit = occasion.label === "everyday" ? weatherBit : `${occasion.label}, ${weatherBit}`;
  return `${names.join(", ")}. ${eventBit}. ${why}.`;
}

export function comboKeyFromIds(ids: string[]) {
  return comboKey(ids);
}
