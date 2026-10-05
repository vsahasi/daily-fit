import type { Item } from "@prisma/client";
import { comboKey } from "@/lib/combo";
import { everydayOccasion, type Occasion } from "@/lib/occasion";
import { rotationScore, type Recency } from "@/lib/rotation";
import { scoreTaste, tasteReady, type Taste } from "@/lib/taste";
import type { Weather } from "@/lib/types";

export type ScoredLook = {
  itemIds: string[];
  score: number;
  reason: string;
};

export type LookPref = {
  liked: string[][];
  passed: string[][];
};

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
]);

function hay(item: Item) {
  return `${item.name} ${item.subcategory ?? ""} ${item.silhouette ?? ""} ${item.material ?? ""}`.toLowerCase();
}

function families(item: Item) {
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
}

function occasions(item: Item) {
  try {
    const profile = item.profile ? (JSON.parse(item.profile) as { occasions?: string[] }) : null;
    return (profile?.occasions ?? []).map((tag) => tag.toLowerCase());
  } catch {
    return [];
  }
}

function loudness(item: Item) {
  const scale = (() => {
    try {
      const profile = item.profile ? (JSON.parse(item.profile) as { patternScale?: string }) : null;
      return profile?.patternScale ?? "none";
    } catch {
      return "none";
    }
  })();
  const pattern = (item.pattern ?? "").toLowerCase();
  if (scale === "large" || pattern.includes("stripe") || pattern.includes("logo") || pattern.includes("graphic")) {
    return 2;
  }
  if (scale === "small" || pattern.includes("check") || pattern.includes("dot")) return 1;
  return 0;
}

export function isShort(item: Item) {
  const text = hay(item);
  if (text.includes("short") || text.includes("trunk") || text.includes("bermuda")) return true;
  if (/\bpant|\btrouser|\bchino|\bjean|\bjogg|\bsweatpant/.test(text) && !text.includes("short")) return false;
  return false;
}

function isSweat(item: Item) {
  return /hoodie|sweatshirt|sweatpant|jogger|fleece/.test(hay(item));
}

function isAthletic(item: Item) {
  return /jersey|dri-fit|dri fit|performance|soccer|athletic/.test(hay(item));
}

export function weatherForOccasion(weather: Weather, occasion: Occasion): Weather {
  if (occasion.climate === "hot") {
    return {
      ...weather,
      tempMax: Math.max(84, weather.tempMax),
      tempMin: Math.max(70, weather.tempMin),
      summary: "warm",
    };
  }
  if (occasion.climate === "cold") {
    return {
      ...weather,
      tempMax: Math.min(52, weather.tempMax),
      tempMin: Math.min(40, weather.tempMin),
      summary: "cold",
    };
  }
  return weather;
}

function neededWarmth(weather: Weather) {
  if (weather.tempMax >= 78) return { min: 2, max: 5, outer: false, shorts: true };
  if (weather.tempMax >= 68) return { min: 3, max: 7, outer: false, shorts: true };
  if (weather.tempMax >= 58) return { min: 5, max: 9, outer: weather.tempMin < 54, shorts: false };
  return { min: 7, max: 12, outer: true, shorts: false };
}

function colorScore(a: Item, b: Item) {
  const fa = families(a);
  const fb = families(b);
  const aNeutral = fa.every((c) => NEUTRALS.has(c));
  const bNeutral = fb.every((c) => NEUTRALS.has(c));
  const overlap = fa.filter((c) => fb.includes(c)).length;
  let score = 8;
  if (aNeutral || bNeutral) score += 10;
  if (aNeutral && bNeutral) score += 4;
  if (overlap && !(aNeutral && bNeutral)) score += 3;
  if (!aNeutral && !bNeutral && overlap === 0) score -= 12;
  if (loudness(a) + loudness(b) >= 3) score -= 14;
  if (loudness(a) + loudness(b) === 2) score -= 6;
  return score;
}

function fitScore(top: Item, bottom: Item) {
  const tf = (top.fit ?? "").toLowerCase();
  const bf = (bottom.fit ?? "").toLowerCase();
  if ((tf.includes("athletic") || tf.includes("slim")) && (bf.includes("relax") || bf.includes("regular"))) return 6;
  if ((tf.includes("relax") || tf.includes("oversize")) && (bf.includes("slim") || bf.includes("taper"))) return 6;
  if (tf.includes("oversize") && bf.includes("oversize")) return -8;
  if (tf.includes("slim") && bf.includes("slim")) return 1;
  return 3;
}

function formalityBalance(items: Item[], occasion: Occasion, dateKey: string) {
  const values = items.map((item) => item.formality);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const spread = max - min;
  const peak = values.reduce((sum, n) => sum + n, 0) / values.length;
  const reasons: string[] = [];
  let score = 0;

  if (spread <= 1) score += 4;
  else if (spread === 2) score += 6;
  else score -= 8;

  if (!occasion.dressy) {
    const rareDressy = hash(dateKey) % 5 === 0;
    if (max >= 4) {
      if (rareDressy && min <= 3) {
        score += 22;
        reasons.push("A nicer piece, grounded by something quieter");
      } else {
        score -= 16;
      }
    } else if (max <= 3) {
      score += 6;
    }
  } else {
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
    if (max >= 4 && min <= 3) {
      score += 8;
      reasons.push("The sharp piece sits next to something calmer");
    } else if (max >= 4 && min >= 4 && occasion.targetFormality <= 3) {
      score -= 6;
    }
  }

  if (max >= 4) {
    const bottom = items.find((item) => item.category === "bottom");
    if (bottom) {
      if (/cargo|athletic|performance|puma|sweatpant|jogger/.test(hay(bottom))) score -= 14;
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
  const outer = items.find((item) => item.category === "outer");
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
    if (top && /tee/.test(hay(top)) && !/jersey|soccer/.test(hay(top)) && loudness(top) < 2) score += 10;
    if (top && /polo|sweater/.test(hay(top))) score -= 8;
    if (top && /hoodie|sweater|quarter-zip|henley/.test(hay(top))) score -= 22;
    if (top && /jersey|soccer/.test(hay(top))) score -= 8;
  }

  if (occasion.vibe === "gym") {
    if (top && (isAthletic(top) || occasions(top).includes("gym"))) score += 12;
    if (bottom && (/short|jogger|sweatpant|performance/.test(hay(bottom)) || isAthletic(bottom))) score += 8;
    if (top && /oxford|button-up|button-down|linen shirt/.test(hay(top))) score -= 16;
    if (bottom && !isShort(bottom) && /chino|linen pant|dress pant/.test(hay(bottom))) score -= 14;
    if (bottom && /cargo/.test(hay(bottom))) score -= 8;
    if (top && /hoodie|sweater/.test(hay(top)) && !isAthletic(top)) score -= 6;
  }

  if (occasion.vibe === "hike") {
    if (top && (/tee|hoodie/.test(hay(top)) || isAthletic(top))) score += 6;
    if (bottom && (isShort(bottom) || /cargo|work pant|jogger/.test(hay(bottom)))) score += 6;
    if (/jersey|oxford|dress/.test(items.map(hay).join(" "))) score -= 10;
  }

  return { score, reasons };
}

function wordList(raw: string) {
  try {
    return JSON.parse(raw || "[]") as string[];
  } catch {
    return [];
  }
}

function notesHit(notes: string[], text: string) {
  return notes.some((note) =>
    note
      .toLowerCase()
      .split(/[,\s/]+/)
      .filter((w) => w.length > 3)
      .some((word) => text.includes(word)),
  );
}

function pairsBonus(a: Item, b: Item) {
  const text = `${b.name} ${b.subcategory ?? ""} ${families(b).join(" ")}`.toLowerCase();
  return notesHit(wordList(a.pairsWith), text) ? 5 : 0;
}

function clashPenalty(a: Item, b: Item) {
  const text = `${a.name} ${b.name} ${a.subcategory ?? ""} ${b.subcategory ?? ""}`.toLowerCase();
  return notesHit([...wordList(a.avoidWith), ...wordList(b.avoidWith)], text) ? -8 : 0;
}

function hash(value: string) {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) n = (n * 31 + value.charCodeAt(i)) >>> 0;
  return n;
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
  items: Item[],
  weather: Weather,
  occasion: Occasion,
  dateKey: string,
  pref?: LookPref,
  ignoreWeather = false,
  taste?: Taste,
  recency?: Recency,
) {
  const top = items.find((item) => item.category === "top");
  const bottom = items.find((item) => item.category === "bottom");
  const outer = items.find((item) => item.category === "outer");
  const extras = items.filter((item) => item.category === "shoes" || item.category === "accessory");
  if (!top || !bottom) return { score: -999, reasons: ["Need a top and a bottom"] };

  const climate = weatherForOccasion(weather, occasion);
  const need = neededWarmth(climate);
  const warmth = items.reduce((sum, item) => sum + item.warmth, 0);
  const reasons: string[] = [];
  let score = 20;

  const color = colorScore(top, bottom) + (outer ? colorScore(top, outer) / 2 : 0);
  score += color;
  const fit = fitScore(top, bottom);
  score += fit;
  const formality = formalityBalance(items, occasion, dateKey);
  score += formality.score;
  reasons.push(...formality.reasons);
  const vibe = vibeScore(items, occasion);
  score += vibe.score;
  reasons.push(...vibe.reasons);
  score += pairsBonus(top, bottom) + (outer ? pairsBonus(top, outer) : 0);
  score += clashPenalty(top, bottom) + (outer ? clashPenalty(top, outer) : 0);
  score += occasionScore(items, occasion);
  score += prefScore(
    items.map((item) => item.id),
    pref,
  );
  const learned = scoreTaste(items, taste);
  score += learned.score;
  reasons.push(...learned.reasons);
  const rotation = rotationScore(items, recency);
  score += rotation.score;
  reasons.push(...rotation.reasons);

  if (!ignoreWeather) {
    if (need.outer && !outer) {
      score -= 16;
      reasons.push("A layer on top for the temperature");
    } else if (!need.outer && outer) {
      if (climate.tempMax >= 74 && !occasion.dressy) score -= 12;
      else score -= 4;
    } else if (outer && occasion.dressy && outer.formality <= 2) {
      score -= 8;
    } else if (outer && need.outer) {
      score += 6;
      reasons.push("A layer that matches the forecast");
    }
  } else if (outer && occasion.dressy && outer.formality <= 2) {
    score -= 8;
  }

  if (occasion.vibe === "everyday") {
    const gymPieces = items.filter((item) => {
      const tags = occasions(item);
      const athleticTee =
        (hay(item).includes("tee") || hay(item).includes("jersey")) &&
        (hay(item).includes("nike") ||
          hay(item).includes("performance") ||
          hay(item).includes("dri-fit") ||
          hay(item).includes("dri fit"));
      return (
        hay(item).includes("jersey") ||
        athleticTee ||
        (tags.length > 0 && tags.every((tag) => tag === "gym"))
      );
    });
    if (gymPieces.length && !tasteReady(taste)) score -= gymPieces.length * 12;
    if (!ignoreWeather && climate.tempMax >= 70 && top && /hoodie|sweatshirt|fleece/.test(hay(top))) {
      score -= 12;
    }
    if (!ignoreWeather && climate.tempMax >= 78) {
      const heavyTop = items.some((item) => {
        return item.category === "top" && (/henley|sweater|hoodie/.test(hay(item)) || item.warmth >= 3);
      });
      if (heavyTop) score -= 10;
      if (items.some(isSweat)) score -= 16;
    }
    if (!tasteReady(taste)) {
      if (bottom && /(chino|linen pant|khaki)/i.test(hay(bottom)) && !/cargo/.test(hay(bottom))) {
        score += 4;
      }
      if (top && /polo/.test(hay(top)) && bottom && /cargo/.test(hay(bottom))) score -= 8;
      if (bottom && /sweatpant|jogger/.test(hay(bottom))) score -= 14;
    }
  }

  if (occasion.dressy) {
    if (occasion.targetFormality >= 4 && top.formality >= 4) score += 10;
    else if (bottom.formality >= 4 && top.formality <= 3) score -= 8;
    const text = hay(top);
    if (/(polo|shirt|oxford|linen)/.test(text)) score += 8;
    if (/(henley|tee|jersey|hoodie)/.test(text)) score -= 10;
    if (/\b(interview|office|meeting|presentation|conference)\b/i.test(occasion.label)) {
      if (/(oxford|button-down|button-up)/.test(text)) score += 8;
      if (/(linen|short-sleeve shirt)/.test(text) && !/oxford/.test(text)) score -= 8;
      if (bottom && /dress pant/.test(hay(bottom))) score += 6;
    }
    if (/\b(wedding|funeral|gala|graduation|church)\b/i.test(occasion.label)) {
      if (/(oxford|button-down|button-up)/.test(text)) score += 12;
      if (/(linen|short-sleeve shirt)/.test(text) && !/oxford/.test(text)) score -= 10;
      if (bottom && /dress pant/.test(hay(bottom))) score += 8;
    }
  }

  const shortsOk = occasion.allowShorts && (ignoreWeather || need.shorts);
  if (isShort(bottom) && !shortsOk) {
    score -= 18;
  } else if (isShort(bottom) && shortsOk) {
    score += 4;
  }

  if (!ignoreWeather) {
    if (warmth < need.min) score -= (need.min - warmth) * 3;
    if (warmth > need.max) score -= (warmth - need.max) * 2;
    if (climate.precipProb >= 40 && items.some((item) => !item.rainOk && item.category === "outer")) {
      score -= 8;
    }
  }

  extras.forEach((extra) => {
    score += colorScore(top, extra) > 0 ? 2 : -4;
  });

  if (color >= 10) reasons.push("Color stays in one lane");
  if (fit >= 6) reasons.push("The fit contrast holds");
  if (isShort(bottom) && shortsOk && !ignoreWeather) reasons.push("Shorts for the heat");
  if (!reasons.length) reasons.push("Clean, wearable, in the clothes you own");

  return { score, reasons };
}

function collectLooks(opts: {
  items: Item[];
  weather: Weather;
  skippedCombos: string[];
  occasion: Occasion;
  dateKey: string;
  pref?: LookPref;
  ignoreWeather?: boolean;
  taste?: Taste;
  recency?: Recency;
}) {
  const available = opts.items.filter((item) => item.status === "available" && item.imagePath);
  const tops = available.filter((item) => item.category === "top");
  const bottoms = available.filter((item) => item.category === "bottom");
  const outers = available.filter((item) => item.category === "outer");
  const skipped = new Set(opts.skippedCombos);
  const need = neededWarmth(weatherForOccasion(opts.weather, opts.occasion));
  const looks: ScoredLook[] = [];
  const ignoreWeather = Boolean(opts.ignoreWeather);

  for (const top of tops) {
    for (const bottom of bottoms) {
      const shells = !ignoreWeather && need.outer && outers.length ? outers : [null];
      for (const outer of shells) {
        const pieces = [top, bottom, ...(outer ? [outer] : [])];
        const ids = pieces.map((item) => item.id);
        if (skipped.has(comboKey(ids))) continue;
        const { score, reasons } = scoreLook(
          pieces,
          opts.weather,
          opts.occasion,
          opts.dateKey,
          opts.pref,
          ignoreWeather,
          opts.taste,
          opts.recency,
        );
        looks.push({
          itemIds: ids,
          score,
          reason: caption(
            pieces,
            weatherForOccasion(opts.weather, opts.occasion),
            opts.occasion,
            reasons,
            ignoreWeather,
          ),
        });
      }
    }
  }

  looks.sort((a, b) => b.score - a.score);
  return looks;
}

function diversify(looks: ScoredLook[], items: Item[], limit: number) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const picked: ScoredLook[] = [];
  const topCounts = new Map<string, number>();
  const bottomCounts = new Map<string, number>();

  for (const look of looks) {
    const pieces = look.itemIds.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
    const top = pieces.find((item) => item.category === "top");
    const bottom = pieces.find((item) => item.category === "bottom");
    if (!top || !bottom) continue;
    if ((topCounts.get(top.id) ?? 0) >= 2) continue;
    if ((bottomCounts.get(bottom.id) ?? 0) >= 2) continue;
    if (picked.some((row) => comboKey(row.itemIds) === comboKey(look.itemIds))) continue;
    picked.push(look);
    topCounts.set(top.id, (topCounts.get(top.id) ?? 0) + 1);
    bottomCounts.set(bottom.id, (bottomCounts.get(bottom.id) ?? 0) + 1);
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
  taste?: Taste;
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
  taste?: Taste;
  /** What was actually worn lately. Today passes it; the Looks deck does not. */
  recency?: Recency;
}): ScoredLook {
  const occasion = opts.occasion ?? everydayOccasion();
  const looks = collectLooks({ ...opts, occasion });
  const best = looks[0];
  if (!best) {
    throw new Error("Need at least one clean top and one clean bottom");
  }
  return best;
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
  const weatherBit =
    weather.tempMax >= 72
      ? `${weather.tempMax}° and ${weather.summary}`
      : `${weather.tempMax}° / ${weather.tempMin}°, ${weather.summary}`;
  const eventBit = occasion.label === "everyday" ? weatherBit : `${occasion.label}, ${weatherBit}`;
  return `${names.join(", ")}. ${eventBit}. ${why}.`;
}

export function comboKeyFromIds(ids: string[]) {
  return comboKey(ids);
}
