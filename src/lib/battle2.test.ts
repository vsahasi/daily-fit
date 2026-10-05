/**
 * Randomized property tests for the outfit engine, second round. The first round
 * (battle.test.ts) covered the shape of a look, blocked-only-when-nothing-passes, the hard
 * weather rules on clothes, rotation in ordinary closets, Another look, the swapPiece
 * contract, and determinism. This file goes after what it did not reach: shoes against the
 * forecast, the day plan on any DayFeel, wind and drizzle, layer semantics, named
 * occasions, likes and rotation arithmetic, the hourly weather read, closet gaps, score
 * and caption sanity, and malformed input.
 *
 * Every closet and forecast comes from a seeded generator, and a failure prints the seed
 * and the closet shrunk to the fewest pieces that still fail:
 *
 *   BATTLE2_SEED=123 BATTLE2_CASES=4000 npx tsx --test src/lib/battle2.test.ts
 *
 * Tests named "BUG n" at the foot of the file are real engine bugs and FAIL on purpose.
 * Everything else passes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Item } from "@prisma/client";
import { bandFor, planDay, type DayPlan } from "@/lib/bands";
import { verdictForPlan } from "@/lib/climate";
import { comboKey } from "@/lib/combo";
import { closetGaps } from "@/lib/gaps";
import { isShort } from "@/lib/garment";
import { hasCollar, hasHood, layerRole, pieceKind } from "@/lib/kinds";
import { isMidKind, isShellKind, layerKind, removableRank, stackVerdict } from "@/lib/layering";
import { buildLikes, likeScore, type Likes } from "@/lib/likes";
import { everydayOccasion, parseOccasion, type Occasion } from "@/lib/occasion";
import { asLayer, normalizeStack, pickLook, scoreLook, swapPiece, weatherForOccasion, type ScoredLook } from "@/lib/pair";
import { buildRecency, rotationScore, type WornLook } from "@/lib/rotation";
import { shoeKind, streetKind } from "@/lib/shoes";
import { testItem } from "@/lib/testing";
import type { DayFeel, Weather } from "@/lib/types";
import { dayFeel, feelFromDaily, hoursOut, type Hourly } from "@/lib/weather";

const BASE_SEED = Number(process.env.BATTLE2_SEED ?? 20261004);
const CASES = Number(process.env.BATTLE2_CASES ?? 1500);

// ---------------------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------------------

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const oneOf = <T,>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];
const chance = (r: Rng, p: number) => r() < p;

function shuffled<T>(r: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// The catalog: the first round's garments, plus the ones this round needs (dress shoes,
// boots, mules, a hooded rain jacket, an overcoat, a cardigan, a zip track top that the
// catalog never called a jacket)
// ---------------------------------------------------------------------------------------

type Template = {
  slug: string;
  category: "top" | "bottom" | "outer" | "shoes";
  name: string;
  subcategory?: string;
  silhouette?: string;
  material?: string;
  warmth: number[];
  formality: number;
  /** Chance the piece can take rain. */
  rain: number;
  pattern?: string;
};

const CATALOG: Template[] = [
  // Tops.
  { slug: "tee", category: "top", name: "Pocket Tee", subcategory: "tee", material: "cotton", warmth: [1, 2], formality: 2, rain: 0.9 },
  { slug: "gtee", category: "top", name: "Graphic Logo Tee", subcategory: "tee", material: "cotton", warmth: [1, 2], formality: 1, rain: 0.9, pattern: "graphic" },
  { slug: "lstee", category: "top", name: "Long-Sleeve Tee", subcategory: "tee", material: "cotton", warmth: [2, 3], formality: 2, rain: 0.9 },
  { slug: "henley", category: "top", name: "Short-Sleeve Henley", subcategory: "henley", material: "cotton", warmth: [2], formality: 2, rain: 0.9 },
  { slug: "thermal", category: "top", name: "Waffle Henley", subcategory: "henley", silhouette: "long-sleeve thermal henley", material: "cotton waffle", warmth: [3], formality: 2, rain: 0.9 },
  { slug: "polo", category: "top", name: "Pique Polo", subcategory: "polo", material: "cotton", warmth: [2], formality: 3, rain: 0.9 },
  { slug: "kpolo", category: "top", name: "Short-Sleeve Knit Polo", subcategory: "polo", material: "cotton knit", warmth: [2, 3], formality: 3, rain: 0.7 },
  { slug: "oxford", category: "top", name: "Oxford Button-Down Shirt", subcategory: "shirt", material: "cotton", warmth: [2], formality: 4, rain: 0.8 },
  { slug: "linshirt", category: "top", name: "Linen Short-Sleeve Shirt", subcategory: "shirt", material: "linen", warmth: [1], formality: 3, rain: 0.5 },
  { slug: "jersey", category: "top", name: "Stripe Soccer Jersey", subcategory: "jersey", material: "polyester", warmth: [1], formality: 1, rain: 1, pattern: "stripe" },
  { slug: "drifit", category: "top", name: "Dri-Fit Tee", subcategory: "tee", material: "dri-fit polyester", warmth: [1], formality: 1, rain: 1 },
  { slug: "hoodtop", category: "top", name: "Pullover Hoodie", subcategory: "hoodie", silhouette: "pullover hoodie", material: "cotton fleece", warmth: [3, 4], formality: 2, rain: 0.3 },
  { slug: "sweattop", category: "top", name: "Crewneck Sweatshirt", subcategory: "sweatshirt", material: "cotton fleece", warmth: [3], formality: 2, rain: 0.3 },
  { slug: "qztop", category: "top", name: "Quarter-Zip Sweater", subcategory: "sweater", material: "cotton knit", warmth: [3], formality: 3, rain: 0.3 },
  { slug: "chunky", category: "top", name: "Chunky Knit Sweater", subcategory: "sweater", material: "wool", warmth: [4, 5], formality: 3, rain: 0.2 },
  // Layers.
  { slug: "hoodout", category: "outer", name: "Pullover Hoodie", subcategory: "hoodie", silhouette: "pullover hoodie", material: "cotton fleece", warmth: [3, 4], formality: 2, rain: 0.3 },
  { slug: "ziphood", category: "outer", name: "Zip Hoodie", subcategory: "hoodie", silhouette: "full-zip hoodie", material: "cotton fleece", warmth: [3], formality: 2, rain: 0.3 },
  { slug: "qzout", category: "outer", name: "Performance Quarter-Zip", subcategory: "quarter-zip", material: "polyester", warmth: [2, 3], formality: 2, rain: 0.6 },
  { slug: "sweatout", category: "outer", name: "Crewneck Sweatshirt", subcategory: "sweatshirt", material: "cotton fleece", warmth: [3], formality: 2, rain: 0.3 },
  { slug: "cardigan", category: "outer", name: "Knit Cardigan", subcategory: "sweater", material: "merino knit", warmth: [3], formality: 3, rain: 0.2 },
  { slug: "shacket", category: "outer", name: "Shirt Jacket", subcategory: "jacket", silhouette: "button-front shirt jacket", material: "cotton twill", warmth: [3, 4], formality: 3, rain: 0.5 },
  { slug: "bomber", category: "outer", name: "Bomber Jacket", subcategory: "jacket", silhouette: "zip bomber", material: "nylon", warmth: [3, 4], formality: 3, rain: 0.7 },
  { slug: "shell", category: "outer", name: "Zip Shell Jacket", subcategory: "jacket", silhouette: "zip-front jacket", material: "lightweight woven nylon", warmth: [2, 3], formality: 2, rain: 0.9 },
  { slug: "rainjkt", category: "outer", name: "Hooded Rain Jacket", subcategory: "jacket", silhouette: "zip-front hooded jacket", material: "waxed cotton", warmth: [2, 3], formality: 2, rain: 1 },
  { slug: "fleece", category: "outer", name: "Fleece Jacket", subcategory: "jacket", silhouette: "full-zip fleece jacket", material: "polyester fleece", warmth: [3, 4], formality: 2, rain: 0.2 },
  { slug: "puffer", category: "outer", name: "Puffer Coat", subcategory: "coat", silhouette: "zip puffer", material: "nylon", warmth: [5], formality: 2, rain: 0.9 },
  { slug: "overcoat", category: "outer", name: "Wool Overcoat", subcategory: "coat", material: "wool", warmth: [4, 5], formality: 4, rain: 0.6 },
  { slug: "tracktop", category: "outer", name: "Zip Track Top", subcategory: "track top", silhouette: "full-zip", material: "polyester", warmth: [2], formality: 1, rain: 0.6 },
  // Bottoms.
  { slug: "chino", category: "bottom", name: "Slim Chino", subcategory: "chino", material: "cotton twill", warmth: [2], formality: 3, rain: 0.9 },
  { slug: "cargo", category: "bottom", name: "Cargo Pant", subcategory: "cargo pant", material: "cotton", warmth: [2, 3], formality: 2, rain: 0.9 },
  { slug: "work", category: "bottom", name: "Canvas Work Pant", subcategory: "work pant", material: "cotton canvas", warmth: [3], formality: 2, rain: 0.9 },
  { slug: "cord", category: "bottom", name: "Corduroy Pant", subcategory: "pant", material: "cotton corduroy", warmth: [3, 4], formality: 3, rain: 0.5 },
  { slug: "linpant", category: "bottom", name: "Linen Pant", subcategory: "linen pant", material: "linen", warmth: [1, 2], formality: 3, rain: 0.4 },
  { slug: "dress", category: "bottom", name: "Wool Dress Pant", subcategory: "dress pant", material: "wool", warmth: [3], formality: 4, rain: 0.5 },
  { slug: "jogger", category: "bottom", name: "Fleece Jogger", subcategory: "jogger", material: "cotton fleece", warmth: [3], formality: 1, rain: 0.5 },
  { slug: "sweatpant", category: "bottom", name: "Heavy Sweatpant", subcategory: "sweatpant", material: "cotton fleece", warmth: [3, 4], formality: 1, rain: 0.4 },
  { slug: "cshort", category: "bottom", name: "Chino Short", subcategory: "short", material: "cotton twill", warmth: [1, 2], formality: 2, rain: 0.9 },
  { slug: "ashort", category: "bottom", name: "Athletic Short", subcategory: "short", material: "nylon", warmth: [1], formality: 1, rain: 1 },
  // Shoes.
  { slug: "sneaker", category: "shoes", name: "Leather Sneaker", subcategory: "sneaker", material: "leather", warmth: [2], formality: 2, rain: 0.8 },
  { slug: "canvas", category: "shoes", name: "Canvas Sneaker", subcategory: "sneaker", material: "canvas", warmth: [1], formality: 2, rain: 0.2 },
  { slug: "runner", category: "shoes", name: "Mesh Runner", subcategory: "running shoe", material: "mesh", warmth: [1, 2], formality: 1, rain: 0.4 },
  { slug: "flip", category: "shoes", name: "Flip-Flops", subcategory: "sandal", material: "rubber", warmth: [1], formality: 1, rain: 0.6 },
  { slug: "slide", category: "shoes", name: "Pool Slide", subcategory: "sandal", material: "rubber", warmth: [1], formality: 1, rain: 0.9 },
  { slug: "clog", category: "shoes", name: "Suede Clog", subcategory: "clog", material: "suede", warmth: [2], formality: 2, rain: 0.2 },
  { slug: "mule", category: "shoes", name: "Cork Mule", subcategory: "slip-on", material: "cork", warmth: [1], formality: 2, rain: 0.3 },
  { slug: "boston", category: "shoes", name: "Boston Clog", subcategory: "sandal", material: "leather", warmth: [2], formality: 2, rain: 0.4 },
  { slug: "derby", category: "shoes", name: "Leather Derby", subcategory: "dress shoe", material: "leather", warmth: [2], formality: 4, rain: 0.6 },
  { slug: "boot", category: "shoes", name: "Chelsea Boot", subcategory: "boot", material: "leather", warmth: [3], formality: 3, rain: 0.9 },
];

const BY_SLUG = new Map(CATALOG.map((tpl) => [tpl.slug, tpl]));
const BY_CATEGORY = {
  top: CATALOG.filter((t) => t.category === "top"),
  bottom: CATALOG.filter((t) => t.category === "bottom"),
  outer: CATALOG.filter((t) => t.category === "outer"),
  shoes: CATALOG.filter((t) => t.category === "shoes"),
};

const NEUTRAL = ["White", "Grey", "Black", "Charcoal", "Navy", "Olive", "Cream", "Brown", "Sand"];
const ACCENT = ["Red", "Green", "Burgundy", "Yellow", "Orange", "Rust", "Teal"];
const FITS = [null, null, "slim", "regular", "relaxed", "oversized", "athletic", "straight", "tapered"];
const PROFILES = [
  null,
  null,
  null,
  '{"occasions":["gym"],"patternScale":"none"}',
  '{"occasions":["weekend","campus"],"patternScale":"small"}',
  '{"occasions":["evening"],"patternScale":"large"}',
  "{not json",
];

function makeItem(r: Rng, tpl: Template, n: number, over: Partial<Item> = {}): Item {
  const colour = chance(r, 0.7) ? oneOf(r, NEUTRAL) : oneOf(r, ACCENT);
  const second = chance(r, 0.15) ? oneOf(r, [...NEUTRAL, ...ACCENT]) : null;
  const fams = [colour, ...(second && second !== colour ? [second] : [])].map((c) => c.toLowerCase());
  let profile = oneOf(r, PROFILES);
  if (tpl.slug === "runner" && chance(r, 0.4)) profile = '{"wearAs":"sneaker"}';
  return testItem({
    id: `${tpl.slug}${n}`,
    category: tpl.category,
    name: `${colour} ${tpl.name}`,
    subcategory: tpl.subcategory ?? null,
    silhouette: tpl.silhouette ?? null,
    material: tpl.material ?? null,
    pattern: tpl.pattern ?? null,
    fit: oneOf(r, FITS),
    colors: JSON.stringify(fams),
    colorFamilies: chance(r, 0.03) ? "[]" : JSON.stringify(fams),
    warmth: oneOf(r, tpl.warmth),
    formality: tpl.formality,
    rainOk: chance(r, tpl.rain),
    profile,
    status: chance(r, 0.1) ? "laundry" : "available",
    ...over,
  });
}

const fromSlug = (r: Rng, slug: string, n: number, over: Partial<Item> = {}) => makeItem(r, BY_SLUG.get(slug)!, n, over);

/** 5 to 16 pieces: small closets keep thousands of picks inside the time budget. */
function genCloset(r: Rng, min = 5, max = 16): Item[] {
  const size = min + Math.floor((max - min + 1) * r() ** 1.3);
  const items: Item[] = [];
  for (let n = 0; n < size; n += 1) {
    const roll = r();
    const category = roll < 0.4 ? "top" : roll < 0.66 ? "bottom" : roll < 0.86 ? "outer" : "shoes";
    items.push(makeItem(r, oneOf(r, BY_CATEGORY[category]), n));
  }
  return items;
}

// ---------------------------------------------------------------------------------------
// Forecasts
// ---------------------------------------------------------------------------------------

/** A day whose numbers hang together, as the hourly read would give it. */
function genFeel(r: Rng): { feel: DayFeel; code: number } {
  const high = int(r, 38, 96);
  const swing = chance(r, 0.6) ? int(r, 0, 14) : int(r, 10, 30);
  const dawn = high - swing;
  const low = dawn - int(r, 0, 3);
  const windMax = chance(r, 0.55) ? int(r, 0, 10) : int(r, 0, 28);
  const sunFrac = Math.round(r() * 100) / 100;
  const wet = chance(r, 0.4);
  const popOut = wet ? int(r, 20, 100) : int(r, 0, 25);
  const heavyRain = wet && popOut >= 60 && chance(r, 0.3);
  const rain = heavyRain || (wet && chance(r, 0.5));
  const drizzle = wet && !rain && chance(r, 0.6);
  const fog = !wet && chance(r, 0.15);
  const lowEff = Math.round(low - windMax * 0.3 + (sunFrac > 0.6 ? 2 : 0) - (fog ? 3 : 0));
  const code = heavyRain ? 65 : rain ? 61 : drizzle ? 51 : fog ? 45 : sunFrac > 0.7 ? 0 : sunFrac > 0.4 ? 2 : 3;
  const feel: DayFeel = {
    high,
    low,
    lowEff,
    dawn,
    swing,
    coolHours: lowEff >= 60 ? 0 : int(r, 1, 12),
    eveningEff: Math.round(low + (high - low) * r() * 0.7),
    windMax,
    sunFrac,
    popOut,
    precipHours: wet && popOut >= 40 ? int(r, 0, 8) : 0,
    drizzle,
    rain,
    heavyRain,
    fog,
    fogPastNoon: fog && chance(r, 0.4),
  };
  return { feel, code };
}

/** A day whose numbers need not hang together at all: every field drawn on its own. */
function wildFeel(r: Rng): DayFeel {
  const high = int(r, 15, 108);
  const low = high - int(r, 0, 40);
  const dawn = int(r, low, high);
  const heavyRain = chance(r, 0.12);
  return {
    high,
    low,
    lowEff: low - int(r, 0, 14) + int(r, 0, 5),
    dawn,
    swing: chance(r, 0.5) ? high - dawn : int(r, 0, 40),
    coolHours: int(r, 0, 13),
    eveningEff: int(r, low - 10, high),
    windMax: int(r, 0, 40),
    sunFrac: Math.round(r() * 100) / 100,
    popOut: int(r, 0, 100),
    precipHours: chance(r, 0.6) ? 0 : int(r, 0, 13),
    drizzle: chance(r, 0.2),
    rain: heavyRain || chance(r, 0.2),
    heavyRain,
    fog: chance(r, 0.15),
    fogPastNoon: chance(r, 0.08),
  };
}

const SUMMARIES: Record<number, string> = { 0: "clear", 1: "clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "drizzle", 53: "drizzle", 61: "rain", 63: "rain", 65: "heavy rain", 80: "showers", 82: "heavy showers", 95: "thunderstorm" };
const DAILY_CODES = [0, 1, 2, 3, 45, 48, 51, 53, 61, 63, 65, 80, 82, 95];

function weatherOf(feel: DayFeel, code = 1, date = "2026-10-03"): Weather {
  return {
    date,
    tempMax: feel.high,
    tempMin: feel.low,
    precipProb: feel.popOut,
    code,
    summary: SUMMARIES[code] ?? "mixed",
    locationLabel: "Berkeley",
    windMax: feel.windMax,
    feel,
  };
}

function genWeather(r: Rng): Weather {
  if (chance(r, 0.15)) {
    // A look stored before the hourly read: daily numbers only.
    const tempMax = int(r, 40, 95);
    const code = oneOf(r, DAILY_CODES);
    return {
      date: "2026-10-03",
      tempMax,
      tempMin: tempMax - int(r, 3, 30),
      precipProb: code >= 51 ? int(r, 30, 100) : int(r, 0, 35),
      code,
      summary: SUMMARIES[code],
      locationLabel: "Berkeley",
      ...(chance(r, 0.5) ? { windMax: int(r, 0, 25) } : {}),
    };
  }
  const { feel, code } = genFeel(r);
  return { ...weatherOf(feel, code), tempMax: feel.high + int(r, 0, 2), tempMin: feel.low - int(r, 0, 4) };
}

/** A calm, dry day with the given air high: nothing but temperature is in play. */
function calmDay(high: number, over: Partial<DayFeel> = {}): Weather {
  const low = over.low ?? high - 8;
  const feel: DayFeel = {
    high,
    low,
    lowEff: low,
    dawn: low,
    swing: high - low,
    coolHours: low < 60 ? 2 : 0,
    eveningEff: Math.round((high + low) / 2),
    windMax: 3,
    sunFrac: 0.8,
    popOut: 0,
    precipHours: 0,
    drizzle: false,
    rain: false,
    heavyRain: false,
    fog: false,
    fogPastNoon: false,
    ...over,
  };
  return weatherOf(feel);
}

// ---------------------------------------------------------------------------------------
// Cases, shrinking, reporting
// ---------------------------------------------------------------------------------------

type Case = { seed: number; items: Item[]; weather: Weather };
type Fail = { tag: string; msg: string };
type Prop = (c: Case) => Fail | null;

const DATE_KEY = "2026-10-03:everyday";
const everyday = everydayOccasion();

function genCase(seed: number): Case {
  const r = mulberry32(seed);
  return { seed, items: genCloset(r), weather: genWeather(r) };
}

const ALL_CASES: Case[] = Array.from({ length: CASES }, (_, i) => genCase(BASE_SEED + i));
const some = (n: number) => ALL_CASES.slice(0, Math.min(ALL_CASES.length, n));

const available = (items: Item[]) => items.filter((item) => item.status === "available" && item.imagePath);
const dressable = (items: Item[]) =>
  available(items).some((item) => item.category === "top") && available(items).some((item) => item.category === "bottom");

function describeItem(item: Item) {
  const extra = [
    item.subcategory ? `sub=${JSON.stringify(item.subcategory)}` : "",
    item.silhouette ? `silhouette=${JSON.stringify(item.silhouette)}` : "",
    item.material ? `material=${JSON.stringify(item.material)}` : "",
    item.pattern ? `pattern=${item.pattern}` : "",
    item.profile ? `profile=${item.profile}` : "",
    item.status !== "available" ? `status=${item.status}` : "",
  ].filter(Boolean);
  return `    ${item.id}: ${item.category} "${item.name}" w${item.warmth} f${item.formality} rainOk=${item.rainOk} colours=${item.colorFamilies}${extra.length ? ` ${extra.join(" ")}` : ""}`;
}

function describeCase(c: Case) {
  return [`  seed=${c.seed}`, `  weather=${JSON.stringify(c.weather)}`, `  closet (${c.items.length}):`, ...c.items.map(describeItem)].join("\n");
}

function runProp(prop: Prop, c: Case): Fail | null {
  try {
    return prop(c);
  } catch (error) {
    return { tag: "threw", msg: error instanceof Error ? `${error.message}\n${(error.stack ?? "").split("\n").slice(1, 4).join("\n")}` : String(error) };
  }
}

/** Drops pieces one at a time while the same failure still shows. */
function shrink(prop: Prop, c: Case, tag: string): { c: Case; fail: Fail } {
  let current = c;
  let fail = runProp(prop, c)!;
  let progress = true;
  while (progress) {
    progress = false;
    for (const item of current.items) {
      const smaller: Case = { ...current, items: current.items.filter((other) => other !== item) };
      const result = runProp(prop, smaller);
      if (result && result.tag === tag) {
        current = smaller;
        fail = result;
        progress = true;
        break;
      }
    }
  }
  return { c: current, fail };
}

/** Runs a property over the cases. On failure, reports each kind of failure once, shrunk. */
function check(cases: Case[], prop: Prop) {
  const fails = new Map<string, Case[]>();
  for (const c of cases) {
    const fail = runProp(prop, c);
    if (fail) fails.set(fail.tag, [...(fails.get(fail.tag) ?? []), c]);
  }
  if (!fails.size) return;
  const lines: string[] = [];
  for (const [tag, failing] of fails) {
    const shrunk = failing
      .slice(0, 6)
      .map((c) => shrink(prop, c, tag))
      .sort((a, b) => a.c.items.length - b.c.items.length)[0];
    lines.push(
      `[${tag}] ${failing.length} of ${cases.length} cases fail (seeds ${failing.slice(0, 8).map((c) => c.seed).join(", ")}${failing.length > 8 ? ", ..." : ""})`,
      `  ${shrunk.fail.msg}`,
      describeCase(shrunk.c),
    );
  }
  assert.fail(`\n${lines.join("\n")}`);
}

/** The same, for properties over plain seeds (no closet to shrink). */
function checkSeeds(count: number, offset: number, prop: (r: Rng, seed: number) => string | null) {
  const fails: string[] = [];
  let failing = 0;
  for (let i = 0; i < count; i += 1) {
    const seed = BASE_SEED + offset + i;
    let msg: string | null;
    try {
      msg = prop(mulberry32(seed), seed);
    } catch (error) {
      msg = `threw: ${error instanceof Error ? `${error.message}\n${(error.stack ?? "").split("\n").slice(1, 4).join("\n")}` : String(error)}`;
    }
    if (msg) {
      failing += 1;
      if (fails.length < 3) fails.push(`seed=${seed}: ${msg}`);
    }
  }
  if (failing) assert.fail(`\n${failing} of ${count} seeds fail\n${fails.join("\n")}`);
}

// ---------------------------------------------------------------------------------------
// Reading a look
// ---------------------------------------------------------------------------------------

const pickCache = new WeakMap<Case, Map<string, ScoredLook>>();

function pick(c: Case, occasion: Occasion = everyday): ScoredLook {
  let byOccasion = pickCache.get(c);
  if (!byOccasion) {
    byOccasion = new Map();
    pickCache.set(c, byOccasion);
  }
  const cached = byOccasion.get(occasion.label);
  if (cached) return cached;
  const look = pickLook({ items: c.items, weather: c.weather, skippedCombos: [], occasion, dateKey: `2026-10-03:${occasion.label}` });
  byOccasion.set(occasion.label, look);
  return look;
}

function readLook(ids: string[], items: Item[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const pieces = ids.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
  const shoes = pieces.filter((item) => item.category === "shoes");
  const clothes = pieces.filter((item) => item.category !== "shoes");
  const stack = normalizeStack(clothes);
  return { pieces, shoes, clothes, stack, top: stack.top, bottom: stack.bottom, layers: stack.layers };
}

const clothesKey = (ids: string[], items: Item[]) => comboKey(readLook(ids, items).clothes.map((item) => item.id));
const idsOf = (ids: string[]) => ids.join(", ");

/** The plan and the rule switches pickLook reads for an occasion. */
function rulesFor(weather: Weather, occasion: Occasion) {
  const gym = occasion.vibe === "gym";
  const climate = weatherForOccasion(weather, occasion);
  return { climate, plan: planDay(climate, { gym }), opts: { gym, formal: occasion.dressy && occasion.targetFormality >= 4 } };
}

/** A mid that is not also a jacket: what belongs in the inner layer slot. */
const isMid = (item: Item) => !isShellKind(item) && (isMidKind(item) || layerRole(item) === "mid");
const blocksWind = (item: Item) => ["zip shell", "shirt jacket", "coat"].includes(layerKind(item));

/** What a look must be when it is not marked blocked: one base, mids then shells, no base top worn as a layer. */
function layerFail(ids: string[], items: Item[]): Fail | null {
  const { pieces, top, layers } = readLook(ids, items);
  if (!top) return { tag: "no-top", msg: `no top: ${idsOf(ids)}` };
  const extraTops = pieces.filter((item) => item.category === "top" && item.id !== top.id);
  // A button-up worn open over a tee is a legal layer; any other base top over a top is not.
  const openShirt = (item: Item) => ["shirt", "linen shirt"].includes(layerKind(item)) && ["tee", "ls tee", "graphic tee"].includes(layerKind(top));
  const stray = extraTops.find((item) => layerRole(item) === "base" && !openShirt(item));
  if (stray) return { tag: "base-in-layer-slot", msg: `${stray.id} (${layerKind(stray)}) is a base top worn over ${top.id}: ${idsOf(ids)}` };
  if (extraTops.length && layerRole(top) !== "base") return { tag: "mid-top-over-mid-top", msg: `a mid top over a mid top: ${idsOf(ids)}` };
  if (layers.length > 2) return { tag: "three-layers", msg: `${layers.length} layers: ${idsOf(ids)}` };
  const firstShell = layers.findIndex((layer) => isShellKind(layer));
  if (firstShell >= 0 && layers.slice(firstShell).some((layer) => !isShellKind(layer))) {
    return { tag: "shell-under-mid", msg: `layers out of order: ${layers.map((layer) => `${layer.id}(${layerKind(layer)})`).join(" then ")}` };
  }
  if (layers.length === 2 && !(isMid(layers[0]) && isShellKind(layers[1]))) {
    return { tag: "two-layers-not-mid-shell", msg: `two layers that are not a mid then a jacket: ${layers.map((layer) => `${layer.id}(${layerKind(layer)})`).join(" then ")}` };
  }
  const verdict = stackVerdict(top, layers);
  if (!verdict.ok) return { tag: "illegal-stack", msg: `${verdict.why}: ${idsOf(ids)}` };
  return null;
}

const OCCASION_LABELS = ["gym", "the beach", "a hike", "a flight", "brunch", "dinner", "an interview", "a wedding", "class"] as const;
const OCCASIONS = OCCASION_LABELS.map((label) => parseOccasion(label));

// ---------------------------------------------------------------------------------------
// A. Shoes
// ---------------------------------------------------------------------------------------

test("A1. an unblocked look never carries a pair that fails the forecast while a clean pair passes with the same clothes, on any occasion", () => {
  check(ALL_CASES, (c) => {
    if (!dressable(c.items)) return null;
    // One occasion per case besides the everyday pick, so every vibe is exercised across the run.
    for (const occasion of [everyday, OCCASIONS[c.seed % OCCASIONS.length]]) {
      const look = pick(c, occasion);
      if (look.blocked) continue;
      const { shoes, stack } = readLook(look.itemIds, c.items);
      const clean = available(c.items).filter((item) => item.category === "shoes");
      if (!clean.length) {
        if (shoes.length) return { tag: "shoes-from-nowhere", msg: `${shoes[0].id} is not clean (${occasion.label})` };
        continue;
      }
      if (shoes.length !== 1) return { tag: "barefoot", msg: `${shoes.length} pairs on though ${clean.length} are clean (${occasion.label}): ${idsOf(look.itemIds)}` };
      const { plan, opts } = rulesFor(c.weather, occasion);
      const verdict = (pair: Item) => verdictForPlan([...stack.all, pair], plan, opts);
      const worn = verdict(shoes[0]);
      const better = clean.find((pair) => verdict(pair).ok);
      if (!worn.ok && better) {
        return { tag: "bad-shoes", msg: `${occasion.label}: ${shoes[0].id} fails ("${worn.why}") though ${better.id} passes with ${idsOf(look.itemIds)}` };
      }
    }
    return null;
  });
});

test("A2. a clog, a mule, or a Boston is never read as a sandal: not by shoeKind, not by the forecast rules, whatever the catalog called it", () => {
  checkSeeds(1500, 10_000, (r) => {
    const clog = fromSlug(r, oneOf(r, ["clog", "mule", "boston"]), 1, { status: "available", rainOk: true });
    if (shoeKind(clog) !== "clog") return `${clog.name} (sub ${clog.subcategory}) reads as ${shoeKind(clog)}`;
    if (streetKind(clog) !== "clog") return `${clog.name} is a ${streetKind(clog)} on the street`;
    const top = fromSlug(r, "lstee", 2, { status: "available", warmth: 3 });
    const bottom = fromSlug(r, "chino", 3, { status: "available" });
    const plan = planDay(weatherOf(wildFeel(r)));
    // A rain-safe sneaker with the same clothes gets the same answer: no sandal rule fires for the clog.
    const sneaker = fromSlug(r, "sneaker", 4, { status: "available", rainOk: true });
    const withClog = verdictForPlan([top, bottom, clog], plan);
    const withSneaker = verdictForPlan([top, bottom, sneaker], plan);
    if (!withClog.ok && /flip-flop|sandal/i.test(withClog.why)) return `the clog was ruled out as a sandal: "${withClog.why}"`;
    if (withClog.ok !== withSneaker.ok) return `clog ${JSON.stringify(withClog)} but sneaker ${JSON.stringify(withSneaker)} at plan ${JSON.stringify(plan)}`;
    return null;
  });
});

test("A3. a runner worn as a sneaker is a sneaker on the street and still a runner by kind; an unreadable profile changes nothing", () => {
  checkSeeds(300, 20_000, (r) => {
    const worn = fromSlug(r, "runner", 1, { profile: '{"wearAs":"sneaker"}' });
    if (shoeKind(worn) !== "runner") return `shoeKind ${shoeKind(worn)}`;
    if (streetKind(worn) !== "sneaker") return `streetKind ${streetKind(worn)}`;
    for (const profile of [null, "", "{not json", "null", "[]", '{"wearAs":"runner"}', '{"wearAs":5}', '"sneaker"']) {
      const plain = fromSlug(r, "runner", 2, { profile });
      if (shoeKind(plain) !== "runner" || streetKind(plain) !== "runner") return `profile ${profile}: ${shoeKind(plain)} / ${streetKind(plain)}`;
    }
    // wearAs only ever moves a runner: a sandal that claims to be a sneaker is still a sandal.
    const flip = fromSlug(r, "flip", 3, { profile: '{"wearAs":"sneaker"}' });
    if (streetKind(flip) !== "sandal") return `a flip-flop with wearAs sneaker reads as ${streetKind(flip)}`;
    return null;
  });
});

// ---------------------------------------------------------------------------------------
// B. The day plan on any DayFeel
// ---------------------------------------------------------------------------------------

/**
 * How much warmth the plan insists on beyond a bare short sleeve: the layers it demands, or
 * the insulation rule when that is stricter. `layers.min` on its own is not monotone in the
 * high, by design: at 62 after a 50 degree dawn a warm long sleeve alone passes (min 0,
 * insulation "one"), while at 72 the top must be a short sleeve and the layer becomes
 * mandatory (min 1). This measure counts both.
 */
function demand(plan: DayPlan) {
  const insulation = plan.insulation === "three" ? (plan.strictThree ? 2 : 1) : plan.insulation === "none" ? 0 : 1;
  return Math.max(plan.layers.min, insulation);
}

test("B. planDay is coherent on any DayFeel, even one whose numbers do not hang together", () => {
  checkSeeds(6000, 30_000, (r) => {
    const feel = wildFeel(r);
    const gym = chance(r, 0.2);
    const plan = planDay(weatherOf(feel), { gym });
    const at = `feel=${JSON.stringify(feel)} plan=${JSON.stringify(plan)}`;
    if (plan.layers.min > plan.layers.max) return `layers.min > layers.max: ${at}`;
    if (feel.high > 70 && (plan.sleeves !== "short" || plan.knitTop)) return `above 70 without the short-sleeve rule: ${at}`;
    if (feel.high > 70 && plan.topMaxWarmth > 2) return `above 70 with a warm top allowed: ${at}`;
    if (feel.high >= 80 && plan.rainTier < 2 && plan.layers.max !== 0) return `a layer at ${feel.high} with no rain: ${at}`;
    if (!gym && plan.high < 58 && plan.shorts !== "no") return `shorts at an adjusted ${plan.high}: ${at}`;
    if (gym && plan.shorts !== "yes") return `gym without shorts: ${at}`;
    if (plan.strictThree && plan.insulation !== "three") return `strictThree without three layers: ${at}`;
    if (plan.strictThree && plan.layers.min !== 2) return `strictThree with layers.min ${plan.layers.min}: ${at}`;
    if (plan.band !== bandFor(plan.high)) return `band ${plan.band} for ${plan.high}: ${at}`;
    if (plan.airHigh !== feel.high || plan.high > feel.high) return `airHigh or adjusted high off: ${at}`;
    if (plan.layers.shell === "required" && plan.layers.max === 0) return `a jacket required and no layer allowed: ${at}`;
    if (plan.layers.shell === "required" && plan.layers.min === 0) return `a jacket required and no layer demanded: ${at}`;
    if (plan.wet && plan.rainTier === 0) return `wet with rainTier 0: ${at}`;
    if (plan.sandals && (plan.band === "cool" || plan.band === "cold" || plan.band === "freezing")) return `sandals in the ${plan.band} band: ${at}`;
    if (plan.rainTier >= 3 && plan.fleece !== "no") return `fleece bottoms in heavy rain: ${at}`;
    if (plan.wetShoesOut !== plan.rainTier >= 2) return `wetShoesOut disagrees with rainTier: ${at}`;

    // Ten degrees warmer, everything else the same, never asks for more.
    const warmer = planDay(weatherOf({ ...feel, high: feel.high + 10 }), { gym });
    if (demand(warmer) > demand(plan)) return `10 degrees warmer demands more (${demand(plan)} -> ${demand(warmer)}): ${at} warmer=${JSON.stringify(warmer)}`;
    if (warmer.high < plan.high) return `10 degrees warmer lowers the adjusted high: ${at}`;

    // More chance of rain never lowers the rain tier.
    let last = -1;
    for (let pop = 0; pop <= 100; pop += 5) {
      const tier = planDay(weatherOf({ ...feel, popOut: pop })).rainTier;
      if (tier < last) return `rainTier falls from ${last} to ${tier} at popOut ${pop}: ${at}`;
      last = tier;
    }
    return null;
  });
});

// ---------------------------------------------------------------------------------------
// C. Wind and drizzle
// ---------------------------------------------------------------------------------------

test("C. on an unblocked look the outermost layer blocks the wind when the plan says so, and takes the drizzle when it is wet", () => {
  let windy = 0;
  let wet = 0;
  check(ALL_CASES, (c) => {
    if (!dressable(c.items)) return null;
    const look = pick(c);
    if (look.blocked) return null;
    const plan = planDay(c.weather);
    const { layers } = readLook(look.itemIds, c.items);
    const outermost = layers[layers.length - 1];
    if (!outermost) return null;
    if (plan.layers.windBlock && plan.layers.max >= 1) {
      windy += 1;
      if (!blocksWind(outermost)) return { tag: "wind", msg: `${outermost.id} (${layerKind(outermost)}) outermost in a ${plan.windMax} mph wind, band ${plan.band}: ${idsOf(look.itemIds)}` };
    }
    if (plan.wet && plan.rainTier >= 1) {
      wet += 1;
      if (!outermost.rainOk && layerKind(outermost) !== "shirt jacket") {
        return { tag: "drizzle", msg: `${outermost.id} (${layerKind(outermost)}, rainOk=false) outermost on a wet day, tier ${plan.rainTier}: ${idsOf(look.itemIds)}` };
      }
    }
    if (plan.rainTier >= 2 && !outermost.rainOk) return { tag: "rain", msg: `${outermost.id} cannot take rain, tier ${plan.rainTier}: ${idsOf(look.itemIds)}` };
    return null;
  });
  assert.ok(windy >= 20 && wet >= 20, `too few layered looks on windy (${windy}) or wet (${wet}) days to mean anything`);
});

// ---------------------------------------------------------------------------------------
// D. Layer semantics
// ---------------------------------------------------------------------------------------

test("D1. no unblocked look has a base top in a layer slot; layers run mids then jackets; two layers are exactly a mid then a jacket; no piece twice", () => {
  let layered = 0;
  check(ALL_CASES, (c) => {
    if (!dressable(c.items)) return null;
    const look = pick(c);
    if (new Set(look.itemIds).size !== look.itemIds.length) return { tag: "piece-twice", msg: `a piece twice${look.blocked ? " (blocked look)" : ""}: ${idsOf(look.itemIds)}` };
    if (look.blocked) return null;
    if (readLook(look.itemIds, c.items).layers.length) layered += 1;
    return layerFail(look.itemIds, c.items);
  });
  assert.ok(layered >= 100, `only ${layered} layered looks`);
});

test("D2. the same holds after swapPiece, for every slot of the look", () => {
  check(some(700), (c) => {
    if (!dressable(c.items)) return null;
    const look = pick(c);
    for (const itemId of look.itemIds) {
      let swapped: ScoredLook;
      try {
        swapped = swapPiece({ items: c.items, weather: c.weather, dateKey: DATE_KEY, current: look.itemIds, itemId });
      } catch (error) {
        if (error instanceof Error && /^Nothing else clean/.test(error.message)) continue;
        throw error;
      }
      if (new Set(swapped.itemIds).size !== swapped.itemIds.length) return { tag: "swap-piece-twice", msg: `swapping ${itemId} wears a piece twice: ${idsOf(swapped.itemIds)}` };
      if (swapped.blocked) continue;
      const fail = layerFail(swapped.itemIds, c.items);
      if (fail) return { tag: `swap-${fail.tag}`, msg: `swapping ${itemId} out of ${idsOf(look.itemIds)}: ${fail.msg}` };
    }
    return null;
  });
});

test("D3. normalizeStack on any pile: mids before jackets, every piece kept once, a base top chosen as the base when there is one", () => {
  checkSeeds(3000, 40_000, (r) => {
    const pile: Item[] = [];
    let n = 0;
    for (let i = int(r, 0, 3); i > 0; i -= 1) pile.push(makeItem(r, oneOf(r, BY_CATEGORY.top), (n += 1)));
    for (let i = int(r, 0, 2); i > 0; i -= 1) pile.push(makeItem(r, oneOf(r, BY_CATEGORY.bottom), (n += 1)));
    for (let i = int(r, 0, 3); i > 0; i -= 1) pile.push(makeItem(r, oneOf(r, BY_CATEGORY.outer), (n += 1)));
    if (chance(r, 0.4)) pile.push(makeItem(r, oneOf(r, BY_CATEGORY.shoes), (n += 1)));
    const pieces = shuffled(r, pile);
    const stack = normalizeStack(pieces);
    const shown = pieces.map((item) => `${item.id}(${item.category})`).join(", ");
    const firstShell = stack.layers.findIndex((layer) => isShellKind(layer));
    if (firstShell >= 0 && stack.layers.slice(firstShell).some((layer) => !isShellKind(layer))) return `a jacket under a mid: ${stack.layers.map((layer) => layer.id).join(", ")} from ${shown}`;
    if (comboKey(stack.all.map((item) => item.id)) !== comboKey(pieces.map((item) => item.id))) return `pieces lost or doubled: ${stack.all.map((item) => item.id).join(", ")} from ${shown}`;
    const tops = pieces.filter((item) => item.category === "top");
    if (tops.some((item) => layerRole(item) === "base") && (!stack.top || layerRole(stack.top) !== "base")) return `a mid chosen as the base over a real base: ${shown}`;
    if (stack.layers.some((layer) => layer.category !== "outer")) return `a layer not read as a layer: ${shown}`;
    if (tops.length && !stack.top) return `tops and no base: ${shown}`;
    return null;
  });
});

test("D4. removableRank: a pullover hoodie does not come along past 66, a bomber not from 71, in the dry or the wet", () => {
  checkSeeds(400, 50_000, (r) => {
    const hoodie = oneOf(r, [fromSlug(r, "hoodout", 1), asLayer(fromSlug(r, "hoodtop", 2)), fromSlug(r, "sweatout", 3)]);
    const bomber = fromSlug(r, "bomber", 4);
    const zip = fromSlug(r, "ziphood", 5);
    for (let high = 40; high <= 100; high += 1) {
      for (const wet of [false, true]) {
        const h = removableRank(hoodie, high, wet);
        if (high > 66 ? h !== null : h === null) return `${hoodie.name} at ${high} wet=${wet}: ${h}`;
        const b = removableRank(bomber, high, wet);
        if (high >= 71 ? b !== null : b === null) return `bomber at ${high} wet=${wet}: ${b}`;
        if (removableRank(zip, high, wet) === null) return `a zip hoodie cannot be carried at ${high}`;
      }
    }
    return null;
  });
});

test("D5. stackVerdict never accepts two hoods, a mid over a mid, a pullover hoodie or sweatshirt over a collared top, a zip hoodie over a polo, or anything over a jacket", () => {
  let accepted = 0;
  checkSeeds(6000, 60_000, (r) => {
    const top = makeItem(r, oneOf(r, BY_CATEGORY.top), 1);
    const layerPool = [...BY_CATEGORY.outer, ...BY_CATEGORY.top.filter((tpl) => ["hoodtop", "sweattop", "qztop", "chunky"].includes(tpl.slug))];
    const layers = Array.from({ length: int(r, 1, 3) }, (_, i) => asLayer(makeItem(r, oneOf(r, layerPool), i + 2)));
    const verdict = stackVerdict(top, layers);
    if (!verdict.ok) return null;
    accepted += 1;
    const order = [top, ...layers];
    const shown = order.map((item) => `${item.name} (${layerKind(item)})`).join(" under ");
    if (layers.length > 2) return `three layers accepted: ${shown}`;
    if (order.filter(hasHood).length >= 2) return `two hoods: ${shown}`;
    for (let i = 1; i < order.length; i += 1) {
      const inner = order[i - 1];
      const outer = order[i];
      const ok = layerKind(outer);
      if (isMidKind(inner) && isMidKind(outer)) return `a mid over a mid: ${shown}`;
      if (isShellKind(inner)) return `something over a jacket: ${shown}`;
      if ((ok === "hoodie" || ok === "sweatshirt") && i === 1 && hasCollar(inner)) return `a ${ok} over a collar: ${shown}`;
      if (ok === "zip hoodie" && i === 1 && pieceKind(inner) === "polo") return `a zip hoodie over a polo: ${shown}`;
    }
    if (layers.length === 2 && !(isMid(layers[0]) && isShellKind(layers[1]))) return `two layers that are not a mid then a jacket: ${shown}`;
    if (!Number.isFinite(verdict.score)) return `score ${verdict.score}: ${shown}`;
    return null;
  });
  assert.ok(accepted >= 500, `only ${accepted} stacks accepted`);
});

// ---------------------------------------------------------------------------------------
// E. Occasions
// ---------------------------------------------------------------------------------------

test("E1. every named occasion dresses a dressable closet without throwing, and an unblocked look is a legal stack that passes that occasion's forecast rules", () => {
  check(some(400), (c) => {
    if (!dressable(c.items)) return null;
    for (const occasion of OCCASIONS) {
      const look = pick(c, occasion);
      if (!Number.isFinite(look.score)) return { tag: "score", msg: `${occasion.label}: score ${look.score}` };
      const { top, bottom, stack } = readLook(look.itemIds, c.items);
      if (!top || !bottom) return { tag: "no-top-or-bottom", msg: `${occasion.label}: ${idsOf(look.itemIds)}` };
      if (look.blocked) continue;
      const fail = layerFail(look.itemIds, c.items);
      if (fail) return { tag: fail.tag, msg: `${occasion.label}: ${fail.msg}` };
      const { plan, opts } = rulesFor(c.weather, occasion);
      const verdict = verdictForPlan(stack.all, plan, opts);
      if (!verdict.ok) return { tag: "unblocked-but-fails", msg: `${occasion.label}: "${verdict.why}" for ${idsOf(look.itemIds)}` };
    }
    return null;
  });
});

test("E2. at an interview or a wedding an oxford is not blocked for its sleeves in the heat; a long-sleeve tee still is; and every day the oxford is", () => {
  checkSeeds(600, 70_000, (r, seed) => {
    const high = int(r, 71, 95);
    const weather = calmDay(high, { low: high - int(r, 2, 12) });
    const oxford = fromSlug(r, "oxford", 1, { status: "available" });
    const lstee = fromSlug(r, "lstee", 2, { status: "available", warmth: 2 });
    const chino = fromSlug(r, "chino", 3, { status: "available" });
    const at = `at ${high} (seed ${seed})`;
    for (const label of ["an interview", "a wedding"]) {
      const occasion = parseOccasion(label);
      const { plan, opts } = rulesFor(weather, occasion);
      if (!opts.formal) return `${label} is not read as formal`;
      const shirt = verdictForPlan([oxford, chino], plan, opts);
      if (!shirt.ok) return `${label} ${at}: the oxford is blocked: "${shirt.why}"`;
      const tee = verdictForPlan([lstee, chino], plan, opts);
      if (tee.ok || !/long sleeve/i.test(tee.why)) return `${label} ${at}: the long-sleeve tee is ${tee.ok ? "allowed" : `blocked for "${tee.why}"`}`;
      // End to end: with both clean the oxford goes out, unblocked.
      const look = pickLook({ items: [lstee, oxford, chino], weather, skippedCombos: [], occasion, dateKey: `2026-10-03:${label}` });
      if (look.blocked || !look.itemIds.includes(oxford.id)) return `${label} ${at}: picked ${idsOf(look.itemIds)} blocked=${look.blocked}`;
      // With only the tee, the look says why it is wrong.
      const forced = pickLook({ items: [lstee, chino], weather, skippedCombos: [], occasion, dateKey: `2026-10-03:${label}` });
      if (!forced.blocked || !/long sleeve/i.test(forced.blocked)) return `${label} ${at}: a long-sleeve tee alone went out unblocked`;
    }
    const plain = verdictForPlan([oxford, chino], planDay(weather));
    if (plain.ok) return `every day ${at}: the oxford's long sleeve passes`;
    // Brunch is dressy but not formal: no exemption.
    const brunch = rulesFor(weather, parseOccasion("brunch"));
    if (verdictForPlan([oxford, chino], brunch.plan, brunch.opts).ok) return `brunch ${at}: the oxford's long sleeve passes`;
    return null;
  });
});

test("E3. at the gym, with an athletic top and athletic shorts clean, the pick is never blocked, and from 58 degrees up never long canvas or chino trousers", () => {
  check(some(900), (c) => {
    const r = mulberry32(c.seed ^ 0x9e3779b9);
    const items = [
      ...c.items,
      // A Dri-Fit tee: with a jersey as the kit top the everyday canon (jersey on athletic shorts, -15) sinks the kit at any temperature. BUG 5.
      fromSlug(r, "drifit", 900, { status: "available" }),
      fromSlug(r, "ashort", 901, { status: "available" }),
    ];
    const look = pickLook({ items, weather: c.weather, skippedCombos: [], occasion: parseOccasion("gym"), dateKey: "2026-10-03:gym" });
    const { bottom } = readLook(look.itemIds, items);
    if (!bottom) return { tag: "no-bottom", msg: idsOf(look.itemIds) };
    if (look.blocked) return { tag: "gym-blocked", msg: `blocked ("${look.blocked}") though a kit is clean: ${idsOf(look.itemIds)}` };
    // Under 58 the invariant does not hold even for a Dri-Fit kit: warm street clothes under a coat outscore it (BUG 5 at the foot of the file).
    const band = planDay(c.weather, { gym: true }).band;
    if (band === "cold" || band === "freezing") return null;
    if (!isShort(bottom) && ["chino", "work pant"].includes(pieceKind(bottom))) {
      const kit = items.slice(-2);
      const kitScore = scoreLook(kit, c.weather, parseOccasion("gym"), "2026-10-03:gym").score;
      return { tag: "gym-in-trousers", msg: `${bottom.id} (${pieceKind(bottom)}) at the gym: ${idsOf(look.itemIds)} (score ${look.score}) over the kit (score ${kitScore}):\n${kit.map(describeItem).join("\n")}` };
    }
    return null;
  });
});

// ---------------------------------------------------------------------------------------
// F. Likes and rotation
// ---------------------------------------------------------------------------------------

function randomStack(r: Rng, items: Item[]): Item[] | null {
  const tops = items.filter((item) => item.category === "top");
  const bottoms = items.filter((item) => item.category === "bottom");
  const outers = items.filter((item) => item.category === "outer");
  const shoes = items.filter((item) => item.category === "shoes");
  if (!tops.length || !bottoms.length) return null;
  return [
    oneOf(r, tops),
    oneOf(r, bottoms),
    ...(outers.length && chance(r, 0.4) ? [oneOf(r, outers)] : []),
    ...(shoes.length && chance(r, 0.5) ? [oneOf(r, shoes)] : []),
  ];
}

const dayBefore = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

function randomHistory(r: Rng, items: Item[], today: string, count: number): WornLook[] {
  const out: WornLook[] = [];
  for (let i = 0; i < count; i += 1) {
    const stack = randomStack(r, items);
    if (stack) out.push({ date: dayBefore(today, int(r, 0, 20)), itemIds: stack.map((item) => item.id) });
  }
  return out;
}

test("F1. likeScore stays inside -12 to 12 for any history, built or hand-made, and never gets better with more turn-downs", () => {
  checkSeeds(1500, 80_000, (r) => {
    const items = genCloset(r, 6, 14);
    const stack = randomStack(r, items);
    if (!stack) return null;
    const ids = stack.map((item) => item.id);
    const looks = (n: number) => Array.from({ length: n }, () => (chance(r, 0.5) ? ids : (randomStack(r, items) ?? stack).map((item) => item.id)));
    const liked = looks(int(r, 0, 40));
    const turnedDown = looks(int(r, 0, 40));
    const swappedOut = Array.from({ length: int(r, 0, 30) }, () => oneOf(r, items).id);
    const built = buildLikes(items, liked, turnedDown, swappedOut);
    const wild: Likes = {
      looks: int(r, 0, 500),
      turnedDown: int(r, 0, 500),
      pairKinds: Object.fromEntries(Object.keys(built.pairKinds).map((key) => [key, int(r, 0, 1000)])),
      passedKinds: Object.fromEntries(Object.keys(built.passedKinds).map((key) => [key, int(r, 0, 1000)])),
      pieces: Object.fromEntries(items.map((item) => [item.id, int(r, 0, 1000)])),
      passedPieces: Object.fromEntries(items.map((item) => [item.id, int(r, 0, 1000)])),
    };
    for (const likes of [built, wild]) {
      const { score } = likeScore(stack, likes);
      if (!Number.isFinite(score) || score < -12 || score > 12) return `likeScore ${score} for ${idsOf(ids)} with ${JSON.stringify(likes)}`;
    }
    // The same look turned down N more times: never a better like score, and never a better look score.
    const weather = calmDay(68);
    let last = likeScore(stack, buildLikes(items, liked)).score;
    let lastLook = scoreLook(stack, weather, everyday, DATE_KEY, undefined, false, buildLikes(items, liked)).score;
    for (const n of [1, 2, 5, 20]) {
      const likes = buildLikes(items, liked, Array.from({ length: n }, () => ids));
      const now = likeScore(stack, likes).score;
      const nowLook = scoreLook(stack, weather, everyday, DATE_KEY, undefined, false, likes).score;
      if (now > last || nowLook > lastLook) return `turned down ${n} times scores higher: like ${last} -> ${now}, look ${lastLook} -> ${nowLook} for ${idsOf(ids)}`;
      last = now;
      lastLook = nowLook;
    }
    return null;
  });
});

test("F2. rotation arithmetic: a stack worn yesterday never scores above zero, and an exact stack worn within 14 days sits at least 120 under the same stack unworn", () => {
  checkSeeds(2500, 90_000, (r) => {
    const today = "2026-10-03";
    const items = genCloset(r, 6, 16);
    const stack = randomStack(r, items)?.filter((item) => item.category !== "shoes");
    if (!stack) return null;
    const ids = stack.map((item) => item.id);
    const key = comboKey(ids);
    const others = (count: number) => randomHistory(r, items, today, count).filter((look) => comboKey(look.itemIds.filter((id) => !id.startsWith("x"))) !== key);
    const notThis = (looks: WornLook[]) => {
      const shoeIds = new Set(items.filter((item) => item.category === "shoes").map((item) => item.id));
      return looks.filter((look) => comboKey(look.itemIds.filter((id) => !shoeIds.has(id))) !== key);
    };
    const worn = notThis(others(int(r, 0, 12)));
    const shown = randomHistory(r, items, today, int(r, 0, 8));
    const turnedDown = randomHistory(r, items, today, int(r, 0, 8));
    const withItems = chance(r, 0.8) ? { items } : {};

    const yesterday = buildRecency([...worn, { date: dayBefore(today, 1), itemIds: ids }], today, { shown, turnedDown, ...withItems });
    const afterYesterday = rotationScore(stack, yesterday).score;
    if (afterYesterday > 0) return `worn yesterday and rotation gives ${afterYesterday} for ${idsOf(ids)}`;

    const ago = int(r, 0, 14);
    const unworn = rotationScore(stack, buildRecency(worn, today, { shown, turnedDown, ...withItems })).score;
    const wornScore = rotationScore(stack, buildRecency([...worn, { date: dayBefore(today, ago), itemIds: shuffled(r, ids) }], today, { shown, turnedDown, ...withItems })).score;
    if (!Number.isFinite(unworn) || !Number.isFinite(wornScore)) return `rotation ${unworn} / ${wornScore}`;
    if (wornScore > unworn - 120) return `worn ${ago} days ago: ${wornScore}, unworn: ${unworn}, only ${unworn - wornScore} apart for ${idsOf(ids)}`;

    // Fifteen days back it is forgotten.
    const old = rotationScore(stack, buildRecency([...worn, { date: dayBefore(today, 15), itemIds: ids }], today, { shown, turnedDown, ...withItems })).score;
    if (old !== unworn) return `a wear 15 days ago still counts: ${old} vs ${unworn}`;
    // A wear dated tomorrow is not history.
    const future = rotationScore(stack, buildRecency([...worn, { date: dayBefore(today, -1), itemIds: ids }], today, { shown, turnedDown, ...withItems })).score;
    if (future !== unworn) return `a wear dated tomorrow counts: ${future} vs ${unworn}`;
    return null;
  });
});

/** Four to seven tops and four to six bottoms, all clean. Half the closets are mostly polos. */
function genRotationCloset(r: Rng, poloHeavy: boolean): Item[] {
  const items: Item[] = [];
  let n = 0;
  const add = (slug: string) => items.push(fromSlug(r, slug, (n += 1), { status: "available" }));
  const topCount = int(r, 4, 7);
  const polos = poloHeavy ? Math.max(3, Math.ceil(topCount * (0.55 + r() * 0.45))) : int(r, 0, 1);
  for (let i = 0; i < topCount; i += 1) {
    add(i < polos ? oneOf(r, ["polo", "polo", "kpolo"]) : oneOf(r, ["tee", "tee", "lstee", "henley", "gtee", "oxford", "thermal", "hoodtop", "drifit"]));
  }
  for (let i = int(r, 4, 6); i > 0; i -= 1) add(oneOf(r, ["chino", "chino", "cargo", "work", "cord", "linpant", "cshort", "ashort", "jogger"]));
  for (let i = int(r, 0, 3); i > 0; i -= 1) add(oneOf(r, ["shell", "shacket", "ziphood", "bomber", "rainjkt", "sweatout"]));
  for (let i = int(r, 0, 2); i > 0; i -= 1) add(oneOf(r, ["sneaker", "canvas", "runner"]));
  return items;
}

const STEADY_DAYS: Weather[] = [calmDay(68, { low: 60 }), calmDay(75, { low: 62 }), calmDay(82, { low: 66 }), calmDay(62, { low: 54 }), calmDay(66, { low: 50, coolHours: 4 })];

test("F3. end to end: over 14 days a worn stack never comes back while an unworn stack still passes the forecast, in closets of 4+ tops and 4+ bottoms, polo-heavy ones included", () => {
  const cases: Case[] = Array.from({ length: 90 }, (_, i) => {
    const seed = BASE_SEED + 100_000 + i;
    const r = mulberry32(seed);
    return { seed, items: genRotationCloset(r, i % 2 === 0), weather: oneOf(r, STEADY_DAYS) };
  });
  check(cases, (c) => {
    const tops = c.items.filter((item) => item.category === "top");
    const bottoms = c.items.filter((item) => item.category === "bottom");
    // Shrinking stops at four and four: that is the closet the guarantee is written for.
    if (tops.length < 4 || bottoms.length < 4) return null;
    const worn: WornLook[] = [];
    const keys: string[] = [];
    for (let day = 1; day <= 14; day += 1) {
      const date = `2026-09-${String(day).padStart(2, "0")}`;
      const recency = buildRecency(worn, date, { items: c.items });
      const look = pickLook({ items: c.items, weather: c.weather, skippedCombos: [], dateKey: `${date}:everyday`, recency });
      const key = clothesKey(look.itemIds, c.items);
      const before = keys.indexOf(key);
      if (before >= 0 && !look.blocked) {
        // Is there a passing stack never worn? Skipping every worn stack asks the engine itself.
        let unworn: ScoredLook | null = null;
        try {
          unworn = pickLook({ items: c.items, weather: c.weather, skippedCombos: keys, dateKey: `${date}:everyday`, recency });
        } catch {
          unworn = null;
        }
        if (unworn && !unworn.blocked) {
          const polos = tops.filter((item) => pieceKind(item) === "polo").length;
          return {
            tag: "worn-stack-returns",
            msg: `day ${day} repeats day ${before + 1} (${key}, score ${look.score}) though ${clothesKey(unworn.itemIds, c.items)} (score ${unworn.score}) was never worn and passes; ${polos} of ${tops.length} tops are polos\n  worn: ${keys.join(" / ")}`,
          };
        }
      }
      worn.push({ date, itemIds: look.itemIds });
      keys.push(key);
    }
    return null;
  });
});

// ---------------------------------------------------------------------------------------
// G. The hourly weather read
// ---------------------------------------------------------------------------------------

const DAY = "2026-10-03";
const stamp = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00`;

/** Three days of hours around DAY. Optional arrays come and go; values may be null, as the API sends them. */
function genHourly(r: Rng, opts: { full?: boolean } = {}): Hourly {
  const time: string[] = [];
  for (const date of ["2026-10-02", DAY, "2026-10-04"]) for (let hour = 0; hour < 24; hour += 1) time.push(stamp(date, hour));
  const has = () => opts.full || chance(r, 0.7);
  const base = int(r, 35, 85);
  const hourly: Hourly = { time, temperature_2m: time.map(() => base + int(r, -12, 14)) };
  if (has()) hourly.apparent_temperature = time.map(() => base + int(r, -18, 16));
  if (has()) hourly.wind_speed_10m = time.map(() => (chance(r, 0.2) ? 0 : int(r, 1, 30)));
  if (has()) hourly.sunshine_duration = time.map(() => (chance(r, 0.5) ? 3600 : int(r, 0, 1700)));
  if (has()) hourly.weather_code = time.map(() => oneOf(r, [0, 1, 2, 3, 3, 45, 48, 51, 61, 63, 95]));
  if (has()) hourly.precipitation_probability = time.map(() => int(r, 0, 100));
  if (has()) hourly.precipitation = time.map(() => (chance(r, 0.8) ? 0 : r()));
  return hourly;
}

const isOut = (time: string) => time.startsWith(DAY) && Number(time.slice(11, 13)) >= 8 && Number(time.slice(11, 13)) <= 20;

test("G1. dayFeel reads high and low from the hours 8 to 20 of that date only: nothing outside them changes anything", () => {
  checkSeeds(1500, 110_000, (r) => {
    const hourly = genHourly(r);
    const feel = dayFeel(hourly, DAY);
    if (!feel) return "no read for a full day of hours";
    const temps = hourly.time.map((time, i) => ({ time, temp: hourly.temperature_2m![i] })).filter((row) => isOut(row.time));
    const high = Math.max(...temps.map((row) => row.temp));
    const low = Math.min(...temps.map((row) => row.temp));
    if (feel.high !== high || feel.low !== low) return `high ${feel.high} low ${feel.low}, the hours out say ${high} and ${low}`;
    if (feel.dawn !== hourly.temperature_2m![hourly.time.indexOf(stamp(DAY, 8))]) return `dawn ${feel.dawn} is not the 8am reading`;
    if (feel.swing !== feel.high - feel.dawn) return `swing ${feel.swing}`;
    for (const [key, value] of Object.entries(feel)) {
      if (typeof value === "number" && !Number.isFinite(value)) return `${key} is ${value}`;
    }
    if (feel.sunFrac < 0 || feel.sunFrac > 1) return `sunFrac ${feel.sunFrac}`;
    if (feel.coolHours < 0 || feel.coolHours > 13 || feel.precipHours < 0 || feel.precipHours > 13) return `hours out of range: ${JSON.stringify(feel)}`;
    if (feel.lowEff > feel.high + 5) return `lowEff ${feel.lowEff} above the high ${feel.high}`;
    if (feel.heavyRain && !feel.rain) return "heavy rain without rain";
    if (feel.fogPastNoon && !feel.fog) return "fog past noon without fog";

    // Scramble every hour outside the window and every other date: the read is identical.
    const scramble = <T extends number>(list: T[] | undefined, make: () => number) => list?.map((value, i) => (isOut(hourly.time[i]) ? value : make()));
    const other: Hourly = {
      time: hourly.time,
      temperature_2m: scramble(hourly.temperature_2m, () => int(r, -40, 130)),
      apparent_temperature: scramble(hourly.apparent_temperature, () => int(r, -40, 130)),
      wind_speed_10m: scramble(hourly.wind_speed_10m, () => int(r, 0, 90)),
      sunshine_duration: scramble(hourly.sunshine_duration, () => int(r, 0, 3600)),
      weather_code: scramble(hourly.weather_code, () => oneOf(r, [0, 45, 65, 95])),
      precipitation_probability: scramble(hourly.precipitation_probability, () => int(r, 0, 100)),
      precipitation: scramble(hourly.precipitation, () => r() * 3),
    };
    for (const key of Object.keys(other) as (keyof Hourly)[]) if (other[key] === undefined) delete other[key];
    try {
      assert.deepEqual(dayFeel(other, DAY), feel);
      assert.deepEqual(hoursOut(other, DAY), hoursOut(hourly, DAY));
    } catch {
      return `hours outside 8 to 20 changed the read: ${JSON.stringify(dayFeel(other, DAY))} vs ${JSON.stringify(feel)}`;
    }
    return null;
  });
});

test("G2. wind and fog only ever cool the felt low: with no sun lowEff <= low; one foggy hour takes exactly 5 off; sun before 10 adds nothing", () => {
  checkSeeds(1500, 120_000, (r) => {
    const hourly = genHourly(r, { full: true });
    hourly.sunshine_duration = hourly.time.map(() => 0);
    hourly.wind_speed_10m = hourly.time.map(() => int(r, 1, 30));
    const feel = dayFeel(hourly, DAY)!;
    if (feel.lowEff > feel.low) return `lowEff ${feel.lowEff} above low ${feel.low} with wind and no sun`;
    if (feel.eveningEff > Math.max(...[19, 20].map((hour) => hourly.temperature_2m![hourly.time.indexOf(stamp(DAY, hour))]))) return `eveningEff ${feel.eveningEff} above the evening air`;

    // One hour, no wind: fog is worth exactly five degrees, and sun five the other way from 10am.
    const temp = int(r, 30, 90);
    const hour = int(r, 8, 20);
    const one = (code: number, sunshine: number): Hourly => ({ time: [stamp(DAY, hour)], temperature_2m: [temp], wind_speed_10m: [0], weather_code: [code], sunshine_duration: [sunshine] });
    const clear = dayFeel(one(3, 0), DAY)!;
    const fog = dayFeel(one(oneOf(r, [45, 48]), 0), DAY)!;
    const sun = dayFeel(one(0, 3600), DAY)!;
    if (clear.lowEff !== temp) return `a still, sunless ${temp} feels like ${clear.lowEff}`;
    if (fog.lowEff !== temp - 5 || !fog.fog) return `fog at ${temp} feels like ${fog.lowEff}`;
    if (sun.lowEff !== (hour >= 10 ? temp + 5 : temp)) return `sun at ${hour}:00 and ${temp} feels like ${sun.lowEff}`;
    // Fog wins over sunshine in the same hour.
    if (dayFeel(one(45, 3600), DAY)!.lowEff !== temp - 5) return "sunshine cancelled the fog";
    return null;
  });
});

test("G3. missing arrays, null readings, and other dates never throw or leak a NaN; hoursOut ignores other dates; feelFromDaily is always finite", () => {
  checkSeeds(1500, 130_000, (r) => {
    const hourly = genHourly(r);
    // The API sends null for a missing reading.
    const holes = <T,>(list: T[] | undefined) => list?.map((value) => (chance(r, 0.15) ? (null as unknown as T) : value));
    const holed: Hourly = { time: hourly.time };
    for (const key of ["temperature_2m", "apparent_temperature", "wind_speed_10m", "sunshine_duration", "weather_code", "precipitation_probability", "precipitation"] as const) {
      const list = holes(hourly[key]);
      if (list && !chance(r, 0.15)) holed[key] = list;
    }
    for (const source of [holed, { time: hourly.time } as Hourly, { time: [] } as Hourly, { time: hourly.time, temperature_2m: [] } as Hourly]) {
      const feel = dayFeel(source, DAY);
      if (feel) {
        for (const [key, value] of Object.entries(feel)) {
          if (typeof value === "number" && !Number.isFinite(value)) return `dayFeel.${key} is ${value} from ${Object.keys(source).join(",")}`;
          if (value == null) return `dayFeel.${key} is ${value}`;
        }
        // And the plan built on it is whole.
        const plan = planDay(weatherOf(feel));
        if (!Number.isFinite(plan.high) || plan.layers.min > plan.layers.max) return `plan from a holed read: ${JSON.stringify(plan)}`;
      }
      const out = hoursOut(source, DAY);
      for (const [key, value] of Object.entries(out)) if (!Number.isFinite(value)) return `hoursOut.${key} is ${value}`;
    }
    if (dayFeel(hourly, "2027-01-01") !== undefined) return "a read for a date with no hours";
    if (Object.keys(hoursOut(hourly, "2027-01-01")).length) return "hoursOut for a date with no hours";
    if (Object.keys(hoursOut(undefined, DAY)).length) return "hoursOut with no hourly data";

    // hoursOut: only that date's hours 8 to 20, and 9am for the morning.
    if (hourly.apparent_temperature) {
      const rows = hourly.time.map((time, i) => ({ time, value: hourly.apparent_temperature![i] })).filter((row) => isOut(row.time));
      const out = hoursOut(hourly, DAY);
      if (out.outHigh !== Math.max(...rows.map((row) => row.value)) || out.outLow !== Math.min(...rows.map((row) => row.value))) return `hoursOut ${JSON.stringify(out)}`;
      if (out.morning !== hourly.apparent_temperature[hourly.time.indexOf(stamp(DAY, 9))]) return `morning ${out.morning}`;
    }

    // feelFromDaily on any daily forecast.
    const tempMax = int(r, -10, 115);
    const daily: Weather = {
      date: DAY,
      tempMax,
      tempMin: tempMax - int(r, 0, 45),
      precipProb: int(r, 0, 100),
      code: chance(r, 0.8) ? oneOf(r, DAILY_CODES) : int(r, 0, 99),
      summary: "x",
      locationLabel: "x",
      ...(chance(r, 0.5) ? { windMax: int(r, 0, 60) } : {}),
    };
    const feel = feelFromDaily(daily);
    for (const [key, value] of Object.entries(feel)) {
      if (typeof value === "number" && !Number.isFinite(value)) return `feelFromDaily.${key} is ${value} for ${JSON.stringify(daily)}`;
      if (value == null) return `feelFromDaily.${key} is ${value}`;
    }
    if (feel.lowEff > feel.low) return `feelFromDaily lowEff ${feel.lowEff} above low ${feel.low}`;
    const plan = planDay(daily);
    if (plan.layers.min > plan.layers.max || !Number.isFinite(plan.high)) return `plan from daily numbers: ${JSON.stringify(plan)}`;
    return null;
  });
});

// ---------------------------------------------------------------------------------------
// H. Closet gaps
// ---------------------------------------------------------------------------------------

/** One piece that answers each gap, as its label describes it. Some gaps count pieces and take more than one. */
const FILLERS: Record<string, (n: number) => Item> = {
  "rain shell": (n) => testItem({ id: `fill-rain-${n}`, category: "outer", name: "Navy Waxed Chore Jacket", subcategory: "jacket", material: "waxed cotton", warmth: 3, rainOk: true }),
  "long-sleeve base": (n) => testItem({ id: `fill-ls-${n}`, category: "top", name: "Grey Long-Sleeve Tee", subcategory: "tee", material: "cotton", colorFamilies: '["grey"]' }),
  "light shell": (n) => testItem({ id: `fill-shell-${n}`, category: "outer", name: "Olive Overshirt Jacket", subcategory: "jacket", material: "cotton twill", warmth: 2, rainOk: false, colorFamilies: '["olive"]' }),
  "dark pant": (n) => testItem({ id: `fill-pant-${n}`, category: "bottom", name: "Navy Slim Chino", subcategory: "chino", material: "cotton twill" }),
  "second sneaker": (n) => testItem({ id: `fill-sneaker-${n}`, category: "shoes", name: "White Canvas Sneaker", subcategory: "sneaker", material: "canvas", rainOk: true, colorFamilies: '["white"]' }),
  "rain shoe": (n) => testItem({ id: `fill-wet-${n}`, category: "shoes", name: "Black Rubber-Toe Sneaker", subcategory: "sneaker", material: "synthetic", rainOk: true, colorFamilies: '["black"]' }),
  "crewneck sweater": (n) => testItem({ id: `fill-crew-${n}`, category: "top", name: "Navy Crewneck Sweater", subcategory: "sweater", material: "merino", warmth: 3 }),
  "winter coat": (n) => testItem({ id: `fill-coat-${n}`, category: "outer", name: "Charcoal Overcoat", subcategory: "coat", material: "wool blend", warmth: 5, rainOk: true, colorFamilies: '["charcoal"]' }),
  "plain shorts": (n) => testItem({ id: `fill-short-${n}`, category: "bottom", name: "Navy Chino Short", subcategory: "short", material: "cotton twill", warmth: 1 }),
  "plain tees": (n) => testItem({ id: `fill-tee-${n}`, category: "top", name: "White Heavyweight Tee", subcategory: "tee", material: "cotton", warmth: 1, colorFamilies: '["white"]' }),
};

test("H. closetGaps: no denim, leather, or suede; keys unique and known; ranked; filling a gap removes it and opens no other; an empty closet is fine", () => {
  assert.doesNotThrow(() => closetGaps([]));
  const emptyKeys = closetGaps([]).map((gap) => gap.key);
  assert.equal(new Set(emptyKeys).size, emptyKeys.length);
  checkSeeds(1200, 140_000, (r) => {
    const items = chance(r, 0.05) ? [] : genCloset(r, 1, 30);
    // Some pieces have no photo yet: they do not count.
    for (const item of items) if (chance(r, 0.05)) item.imagePath = "";
    const gaps = closetGaps(items);
    const keys = gaps.map((gap) => gap.key);
    if (new Set(keys).size !== keys.length) return `a gap twice: ${keys.join(", ")}`;
    for (const [i, gap] of gaps.entries()) {
      if (/jean|denim|leather|suede/i.test(gap.label)) return `"${gap.label}" suggests what the wearer does not wear`;
      if (/undefined|NaN|null/.test(`${gap.label} ${gap.why}`)) return `"${gap.label}": "${gap.why}"`;
      if (!FILLERS[gap.key]) return `unknown gap key ${gap.key}`;
      if (i > 0 && gaps[i - 1].priority < gap.priority) return `gaps out of order: ${keys.join(", ")}`;
      if (!gap.label || !gap.why || !Number.isFinite(gap.priority)) return `a hollow gap: ${JSON.stringify(gap)}`;
    }
    // Buy what a gap asks for (as many as it counts): it goes, and nothing new appears.
    for (const gap of gaps) {
      let closet = items;
      let now = keys;
      for (let n = 1; n <= 8 && now.includes(gap.key); n += 1) {
        closet = [...closet, FILLERS[gap.key](n)];
        now = closetGaps(closet).map((row) => row.key);
        const fresh = now.find((key) => !keys.includes(key));
        if (fresh) return `filling "${gap.key}" opened "${fresh}" (closet of ${items.length}, gaps ${keys.join(", ")})`;
      }
      if (now.includes(gap.key)) return `"${gap.key}" is still a gap after eight of "${gap.label}"`;
    }
    return null;
  });
});

// ---------------------------------------------------------------------------------------
// I. Scores and captions
// ---------------------------------------------------------------------------------------

test("I1. scoreLook is finite, the same twice, and with no history does not care what order the pieces come in", () => {
  check(ALL_CASES, (c) => {
    if (!dressable(c.items)) return null;
    const r = mulberry32(c.seed ^ 0x5bd1e995);
    const occasion = chance(r, 0.5) ? everyday : oneOf(r, OCCASIONS);
    const look = pick(c, occasion);
    const { pieces } = readLook(look.itemIds, c.items);
    const args = [c.weather, occasion, DATE_KEY, undefined, chance(r, 0.15)] as const;
    const first = scoreLook(pieces, ...args);
    if (!Number.isFinite(first.score)) return { tag: "not-finite", msg: `score ${first.score} for ${idsOf(look.itemIds)}` };
    const again = scoreLook(pieces.map((item) => ({ ...item })), ...args);
    if (again.score !== first.score || again.reasons.join("|") !== first.reasons.join("|")) {
      return { tag: "not-deterministic", msg: `${first.score} then ${again.score} for ${idsOf(look.itemIds)}` };
    }
    for (const order of [[...pieces].reverse(), shuffled(r, pieces)]) {
      const other = scoreLook(order, ...args);
      if (other.score !== first.score) {
        return { tag: "order", msg: `${occasion.label}: ${first.score} as ${idsOf(pieces.map((item) => item.id))}, ${other.score} as ${idsOf(order.map((item) => item.id))}` };
      }
    }
    return null;
  });
});

const BAD_TEXT = /undefined|NaN|null|\.\.|\s,|,,|\s\.|  /;

test("I2. captions never leak undefined, NaN, null, a doubled period, or a stray space, and a blocked look says why", () => {
  let blocked = 0;
  check(some(900), (c) => {
    if (!dressable(c.items)) return null;
    const looks: { label: string; look: ScoredLook }[] = [{ label: "everyday", look: pick(c) }];
    const occasion = OCCASIONS[c.seed % OCCASIONS.length];
    looks.push({ label: occasion.label, look: pick(c, occasion) });
    const first = looks[0].look;
    try {
      looks.push({ label: "swap", look: swapPiece({ items: c.items, weather: c.weather, dateKey: DATE_KEY, current: first.itemIds, itemId: first.itemIds[c.seed % first.itemIds.length] }) });
    } catch {
      // Nothing else clean in that slot.
    }
    looks.push({ label: "weather ignored", look: pickLook({ items: c.items, weather: c.weather, skippedCombos: [], dateKey: DATE_KEY, ...{ ignoreWeather: true } }) });
    for (const { label, look } of looks) {
      if (!look.reason || BAD_TEXT.test(look.reason)) return { tag: "caption", msg: `${label}: "${look.reason}"` };
      if (!/\.$/.test(look.reason)) return { tag: "caption-end", msg: `${label}: "${look.reason}"` };
      if (look.blocked != null) {
        blocked += 1;
        if (!look.blocked.trim() || BAD_TEXT.test(look.blocked)) return { tag: "blocked-text", msg: `${label}: blocked="${look.blocked}"` };
        if (!look.reason.includes(look.blocked)) return { tag: "blocked-without-why", msg: `${label}: blocked "${look.blocked}" but the caption reads "${look.reason}"` };
      }
    }
    return null;
  });
  assert.ok(blocked >= 30, `only ${blocked} blocked looks`);
});

// ---------------------------------------------------------------------------------------
// J. Edges
// ---------------------------------------------------------------------------------------

test("J1. band edges: 49/50, 57/58, 64/65, 70/71, 77/78, 84/85, and the wearer's above-70 rule reads the air, not the shifted number", () => {
  const edges: [number, string][] = [[49, "freezing"], [50, "cold"], [57, "cold"], [58, "cool"], [64, "cool"], [65, "mild"], [70, "mild"], [71, "warm"], [77, "warm"], [78, "hot"], [84, "hot"], [85, "scorching"]];
  for (const [high, band] of edges) {
    assert.equal(bandFor(high), band, `bandFor(${high})`);
    assert.equal(planDay(calmDay(high)).band, band, `planDay at a calm ${high}`);
  }
  const lstee = testItem({ id: "ls", category: "top", name: "Grey Long-Sleeve Tee", warmth: 2 });
  const tee = testItem({ id: "tee", category: "top", name: "White Pocket Tee", warmth: 1 });
  const chino = testItem({ id: "chino", category: "bottom", name: "Khaki Slim Chino", subcategory: "chino" });
  const shorts = testItem({ id: "short", category: "bottom", name: "Navy Chino Short", subcategory: "short", warmth: 1 });
  const ashort = testItem({ id: "ashort", category: "bottom", name: "Black Athletic Short", subcategory: "short", material: "nylon", warmth: 1 });
  const hoodie = testItem({ id: "hood", category: "outer", name: "Grey Pullover Hoodie", subcategory: "hoodie", warmth: 3 });
  const bomber = testItem({ id: "bomber", category: "outer", name: "Black Bomber Jacket", subcategory: "jacket", warmth: 3 });
  const heavy = testItem({ id: "cord", category: "bottom", name: "Brown Corduroy Pant", warmth: 4 });

  // 70 against 71: the long sleeve.
  assert.equal(planDay(calmDay(70, { low: 64 })).sleeves, "any");
  assert.equal(planDay(calmDay(71, { low: 64 })).sleeves, "short");
  assert.equal(verdictForPlan([lstee, chino], planDay(calmDay(70, { low: 64 }))).ok, true, "a long sleeve at 70");
  assert.equal(verdictForPlan([lstee, chino], planDay(calmDay(71, { low: 64 }))).ok, false, "a long sleeve at 71");
  // An overcast 71 is a mild-band day by the shifted number, and still a short-sleeve day by the air.
  const grey71 = planDay(calmDay(71, { low: 64, sunFrac: 0.1 }));
  assert.equal(grey71.band, "mild");
  assert.equal(grey71.sleeves, "short");
  assert.equal(grey71.knitTop, false);
  assert.equal(verdictForPlan([lstee, chino], grey71).ok, false, "a long sleeve on an overcast 71");

  // 64 against 65: a tee alone.
  assert.equal(verdictForPlan([tee, chino], planDay(calmDay(64, { low: 60 }))).ok, false, "a tee alone at 64");
  assert.equal(verdictForPlan([tee, chino], planDay(calmDay(65, { low: 60 }))).ok, true, "a tee alone at 65");
  // 57 against 58: shorts. Athletic shorts pass a sunny 58 with a warm top; nothing short passes 57.
  assert.equal(planDay(calmDay(57, { low: 55 })).shorts, "no");
  assert.equal(planDay(calmDay(58, { low: 55 })).shorts, "athletic");
  assert.equal(planDay(calmDay(58, { low: 54 })).shorts, "no", "a 54 degree felt low takes the shorts away");
  // Chino shorts need the warm band.
  assert.equal(verdictForPlan([tee, shorts], planDay(calmDay(70, { low: 64 }))).ok, false, "chino shorts at 70");
  assert.equal(verdictForPlan([tee, ashort], planDay(calmDay(70, { low: 64 }))).ok, true, "athletic shorts at a sunny 70");
  assert.equal(verdictForPlan([tee, shorts], planDay(calmDay(71, { low: 64 }))).ok, true, "chino shorts at 71");
  // 49 against 50: three pieces.
  assert.equal(planDay(calmDay(49, { low: 45 })).strictThree, true);
  assert.equal(planDay(calmDay(49, { low: 45 })).layers.min, 2);
  assert.equal(planDay(calmDay(50, { low: 49 })).strictThree, false);
  assert.equal(planDay(calmDay(50, { low: 49 })).insulation, "long-or-mid");
  // 79 against 80: the carried layer after a cold dawn.
  assert.equal(planDay(calmDay(79, { low: 50, coolHours: 4 })).layers.max, 0, "79 is the hot band: no layer");
  assert.equal(planDay(calmDay(77, { low: 50, coolHours: 4 })).layers.min, 1, "77 after a 50 degree dawn carries a layer");
  // Heavy trousers stop at 68 by the air.
  assert.equal(verdictForPlan([lstee, heavy], planDay(calmDay(67, { low: 62 }))).ok, true, "corduroy at 67");
  assert.equal(verdictForPlan([lstee, heavy], planDay(calmDay(68, { low: 62 }))).ok, false, "corduroy at 68");
  // The carried layer: a pullover hoodie to 66, a bomber to 70.
  const carry = (high: number) => planDay(calmDay(high, { low: 50, coolHours: 4 }));
  assert.equal(verdictForPlan([tee, chino, hoodie], carry(66)).ok, true, "a hoodie carried at 66");
  assert.equal(verdictForPlan([tee, chino, hoodie], carry(67)).ok, false, "a hoodie carried at 67");
  assert.equal(verdictForPlan([tee, chino, bomber], carry(70)).ok, true, "a bomber carried at 70");
  assert.equal(verdictForPlan([tee, chino, bomber], carry(71)).ok, false, "a bomber carried at 71");
});

const BROKEN_JSON = ["", "not json", "{", "{}", "null", '"red"', "[1,2]", "[null]", "[]", '[["navy"]]', '{"length":2}', "true", "0"];
const BROKEN_PROFILES = [...BROKEN_JSON, '{"occasions":"gym"}', '{"occasions":[1,null]}', '{"patternScale":5}', '{"wearAs":5}', '{"occasions":null,"patternScale":null}'];

test("J2. malformed colour and profile JSON, warmth 5 everywhere, and odd formality never throw or produce a NaN, in pickLook, swapPiece, scoreLook, or closetGaps", () => {
  check(some(700), (c) => {
    const r = mulberry32(c.seed ^ 0x27d4eb2f);
    const items = c.items.map((item) => {
      const broken = { ...item };
      if (chance(r, 0.4)) broken.colorFamilies = oneOf(r, BROKEN_JSON);
      if (chance(r, 0.3)) broken.colors = oneOf(r, BROKEN_JSON);
      if (chance(r, 0.4)) broken.profile = oneOf(r, BROKEN_PROFILES);
      if (chance(r, 0.3)) broken.warmth = oneOf(r, [5, 5, 0, 9, -1]);
      if (chance(r, 0.2)) broken.formality = oneOf(r, [0, 5, 9]);
      if (chance(r, 0.1)) broken.pairsWith = "{";
      if (chance(r, 0.1)) broken.layerRole = oneOf(r, ["SHELL", "", "base", "nonsense"]);
      return broken;
    });
    closetGaps(items);
    if (!dressable(items)) return null;
    const occasion = chance(r, 0.5) ? everyday : oneOf(r, OCCASIONS);
    const look = pickLook({ items, weather: c.weather, skippedCombos: [], occasion, dateKey: DATE_KEY });
    if (!Number.isFinite(look.score)) return { tag: "score", msg: `score ${look.score}` };
    // A piece with no readable colour leaves a hole in the caption: BUG 2 at the foot of the file.
    if (/undefined|NaN|null/.test(look.reason)) return { tag: "caption", msg: look.reason };
    const { pieces, top, bottom } = readLook(look.itemIds, items);
    if (!top || !bottom) return { tag: "no-top-or-bottom", msg: idsOf(look.itemIds) };
    const history = [{ date: "2026-10-02", itemIds: look.itemIds }];
    const scored = scoreLook(pieces, c.weather, occasion, DATE_KEY, { liked: [look.itemIds], passed: [look.itemIds] }, false, buildLikes(items, [look.itemIds], [look.itemIds], look.itemIds), buildRecency(history, "2026-10-03", { shown: history, turnedDown: history, items }));
    if (!Number.isFinite(scored.score)) return { tag: "score-with-history", msg: `score ${scored.score}` };
    try {
      const swapped = swapPiece({ items, weather: c.weather, occasion, dateKey: DATE_KEY, current: look.itemIds, itemId: look.itemIds[0] });
      if (!Number.isFinite(swapped.score)) return { tag: "swap-score", msg: `score ${swapped.score}` };
    } catch (error) {
      if (!(error instanceof Error) || !/^Nothing else clean/.test(error.message)) throw error;
    }
    return null;
  });
});

test("J3. a closet of only jackets and trousers, only shoes, only tops, or nothing at all says so plainly instead of crashing", () => {
  check(some(300), (c) => {
    const keep = (categories: string[]) => c.items.filter((item) => categories.includes(item.category)).map((item) => ({ ...item, status: "available" }));
    for (const categories of [["outer", "bottom"], ["shoes"], ["top", "outer", "shoes"], []]) {
      const items = keep(categories);
      for (const occasion of [everyday, parseOccasion("gym"), parseOccasion("a wedding")]) {
        try {
          const look = pickLook({ items, weather: c.weather, skippedCombos: [], occasion, dateKey: DATE_KEY });
          return { tag: "dressed-from-nothing", msg: `[${categories.join(", ")}] gave ${idsOf(look.itemIds)}` };
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "Need at least one clean top and one clean bottom") throw error;
        }
      }
      closetGaps(items);
    }
    return null;
  });
});

test("J4. two pieces that share an id do not crash the pick or put one id in a look twice", () => {
  check(some(500), (c) => {
    if (!dressable(c.items) || c.items.length < 2) return null;
    const r = mulberry32(c.seed ^ 0x165667b1);
    // A second copy of a piece under the same id, as a double upload would leave it.
    const source = oneOf(r, c.items);
    const twin = { ...source, name: `${source.name} Copy`, status: "available" };
    const items = [...c.items, twin];
    const look = pickLook({ items, weather: c.weather, skippedCombos: [], dateKey: DATE_KEY });
    if (!Number.isFinite(look.score)) return { tag: "score", msg: `score ${look.score}` };
    if (new Set(look.itemIds).size !== look.itemIds.length) return { tag: "id-twice", msg: `${idsOf(look.itemIds)} with ${source.id} in the closet twice${look.blocked ? " (blocked)" : ""}` };
    return null;
  });
});

test("J5. swapPiece when the look's top has since gone in the wash: other slots swap around it, and swapping it brings a clean top", () => {
  check(some(700), (c) => {
    if (!dressable(c.items)) return null;
    const look = pick(c);
    const { top, bottom } = readLook(look.itemIds, c.items);
    if (!top || !bottom) return null;
    const items = c.items.map((item) => (item.id === top.id ? { ...item, status: "laundry" } : item));
    const byId = new Map(items.map((item) => [item.id, item]));
    const swap = (itemId: string) => {
      try {
        return swapPiece({ items, weather: c.weather, dateKey: DATE_KEY, current: look.itemIds, itemId });
      } catch (error) {
        if (error instanceof Error && /^Nothing else clean/.test(error.message)) return null;
        throw error;
      }
    };
    const otherBottom = swap(bottom.id);
    if (otherBottom) {
      if (!otherBottom.itemIds.includes(top.id)) return { tag: "top-dropped", msg: `swapping the bottom lost the top: ${idsOf(otherBottom.itemIds)}` };
      const brought = otherBottom.itemIds.filter((id) => !look.itemIds.includes(id));
      if (brought.length !== 1 || byId.get(brought[0])?.category !== "bottom" || byId.get(brought[0])?.status !== "available") {
        return { tag: "bottom-swap", msg: `swapping ${bottom.id} out of ${idsOf(look.itemIds)} gave ${idsOf(otherBottom.itemIds)}` };
      }
    } else if (available(items).some((item) => item.category === "bottom" && item.id !== bottom.id)) {
      return { tag: "refused", msg: `no swap for ${bottom.id} though another bottom is clean` };
    }
    const otherTop = swap(top.id);
    if (otherTop) {
      if (otherTop.itemIds.includes(top.id)) return { tag: "washed-top-kept", msg: `swapping the washed top kept it: ${idsOf(otherTop.itemIds)}` };
      const dirty = otherTop.itemIds.find((id) => byId.get(id)?.status !== "available");
      if (dirty) return { tag: "dirty-piece", msg: `${dirty} is not clean: ${idsOf(otherTop.itemIds)}` };
    } else if (available(items).some((item) => item.category === "top" && !look.itemIds.includes(item.id))) {
      return { tag: "refused", msg: `no swap for the washed ${top.id} though another top is clean` };
    }
    return null;
  });
});

test("J6. Another look: when a wholly fresh top and bottom still pass, the next look uses neither a turned-down top nor a turned-down bottom", () => {
  check(some(700), (c) => {
    if (!dressable(c.items)) return null;
    const first = pick(c);
    if (first.blocked) return null;
    const avoidItems = first.itemIds;
    let next: ScoredLook;
    try {
      next = pickLook({ items: c.items, weather: c.weather, skippedCombos: [comboKey(first.itemIds)], avoidItems, dateKey: DATE_KEY });
    } catch {
      // The first look was the only stack the closet makes.
      return null;
    }
    // The oracle: the same closet without the turned-down tops and bottoms. If that dresses cleanly, so must this.
    const rest = c.items.filter((item) => !(avoidItems.includes(item.id) && (item.category === "top" || item.category === "bottom")));
    let fresh: ScoredLook | null = null;
    try {
      fresh = pickLook({ items: rest, weather: c.weather, skippedCombos: [], dateKey: DATE_KEY });
    } catch {
      fresh = null;
    }
    if (!fresh || fresh.blocked) return null;
    const { top, bottom } = readLook(next.itemIds, c.items);
    if (next.blocked) return { tag: "blocked-though-fresh-passes", msg: `"${next.blocked}" though ${idsOf(fresh.itemIds)} passes` };
    if (next.avoided || (top && avoidItems.includes(top.id)) || (bottom && avoidItems.includes(bottom.id))) {
      return { tag: "turned-down-piece-returns", msg: `after ${idsOf(first.itemIds)} came ${idsOf(next.itemIds)}, though ${idsOf(fresh.itemIds)} is wholly fresh and passes` };
    }
    return null;
  });
});

// ---------------------------------------------------------------------------------------
// Real bugs. Each of these FAILS until the engine is fixed.
// ---------------------------------------------------------------------------------------

const white = (over: Partial<Item> = {}) => testItem({ id: "tee", category: "top", name: "White Pocket Tee", subcategory: "tee", material: "cotton", warmth: 1, colorFamilies: '["white"]', ...over });
const greyLongSleeve = () => testItem({ id: "ls", category: "top", name: "Grey Long-Sleeve Tee", subcategory: "tee", material: "cotton", warmth: 2, colorFamilies: '["grey"]' });
const hoodieTop = () => testItem({ id: "hood", category: "top", name: "Grey Pullover Hoodie", subcategory: "hoodie", material: "cotton fleece", warmth: 3, colorFamilies: '["grey"]' });
const khakiChino = () => testItem({ id: "chino", category: "bottom", name: "Khaki Slim Chino", subcategory: "chino", material: "cotton twill", formality: 3, colorFamilies: '["khaki"]' });
const navyShorts = () => testItem({ id: "short", category: "bottom", name: "Navy Chino Short", subcategory: "short", material: "cotton twill", warmth: 1 });
const athleticShorts = (colour = "black") => testItem({ id: "ashort", category: "bottom", name: `${colour} Athletic Short`, subcategory: "short", material: "nylon", warmth: 1, formality: 1, colorFamilies: `["${colour}"]` });
const flipFlops = () => testItem({ id: "flip", category: "shoes", name: "Black Flip-Flops", subcategory: "sandal", material: "rubber", warmth: 1, formality: 1, colorFamilies: '["black"]' });

/**
 * BUG 1. A freezing day cites a wind that is not blowing. bands.ts:221 hard-codes
 * `windBlock: true` for the freezing band (the outer piece must be a real jacket), and two
 * places read that flag as "it is windy" and print `plan.windMax`: scoreLook's lead reason
 * (pair.ts:299-300, "<jacket> against the N mph wind") and the verdict (climate.ts:109-110,
 * "<jacket> in a N mph wind"). On a still 45 degree day every look reads "Navy Puffer Coat
 * against the 0 mph wind", and a bomber is blocked for "a 0 mph wind".
 * Fix: keep the freezing band's demand for a wind-blocking shell, but word it from the
 * cold when `plan.windMax < 15` ("Three layers for the cold", "<bomber> is not enough
 * jacket for 45°"), e.g. branch on `plan.windMax >= 15` at both sites instead of on
 * `plan.layers.windBlock`.
 */
test("fixed bug 1: on a still freezing day the caption and the blocked reason blame a 0 mph wind", () => {
  const still = calmDay(45, { low: 40, windMax: 0 });
  const fleece = testItem({ id: "fleece", category: "outer", name: "Grey Fleece Jacket", subcategory: "jacket", material: "polyester fleece", warmth: 3, colorFamilies: '["grey"]' });
  const coat = testItem({ id: "coat", category: "outer", name: "Navy Puffer Coat", subcategory: "coat", warmth: 5 });
  const look = pickLook({ items: [greyLongSleeve(), khakiChino(), fleece, coat], weather: still, skippedCombos: [], dateKey: DATE_KEY });
  assert.equal(look.blocked, undefined);
  assert.doesNotMatch(look.reason, /\b[0-9] mph wind/, `the caption blames a wind that is not there: "${look.reason}"`);

  const bomber = testItem({ id: "bomber", category: "outer", name: "Black Bomber Jacket", subcategory: "jacket", warmth: 4, colorFamilies: '["black"]' });
  const forced = pickLook({ items: [white(), hoodieTop(), khakiChino(), bomber], weather: still, skippedCombos: [], dateKey: DATE_KEY });
  assert.doesNotMatch(forced.blocked ?? "", /\b[0-9] mph wind/, `blocked for a wind that is not there: "${forced.blocked}"`);
});

/**
 * BUG 2. A piece with no readable colour leaves a hole in the caption. palette.ts:91 pushes
 * `${cap(main(top))} over ${main(bottom)}` whenever the two lightness values are 30 apart,
 * and a piece whose colorFamilies and colors are both empty or unreadable has main() === ""
 * and a default lightness of 50. A cream top over colourless trousers reads "Cream over ."
 * and a colourless top over navy reads ".  over navy." Found by J2 (11 of 700 closets with
 * broken colour JSON).
 * Fix: only push that reason when both `main(top)` and `main(bottom)` are non-empty.
 */
test("fixed bug 2: a piece with no readable colour leaves 'Cream over .' in the caption", () => {
  const warm = calmDay(75, { low: 66 });
  const cream = white({ name: "Cream Pocket Tee", colorFamilies: '["cream"]' });
  const blankChino = testItem({ id: "chino", category: "bottom", name: "Slim Chino", subcategory: "chino", colorFamilies: "[]", colors: "[]" });
  const a = pickLook({ items: [cream, blankChino], weather: warm, skippedCombos: [], dateKey: DATE_KEY });
  assert.doesNotMatch(a.reason, / over \.|\s\./, `"${a.reason}"`);
  const blankTee = white({ name: "Pocket Tee", colorFamilies: "not json", colors: "null" });
  const navyChino = testItem({ id: "chino", category: "bottom", name: "Navy Slim Chino", subcategory: "chino" });
  const b = pickLook({ items: [blankTee, navyChino], weather: warm, skippedCombos: [], dateKey: DATE_KEY });
  assert.doesNotMatch(b.reason, /\. {2}over|\s\s/, `"${b.reason}"`);
});

/**
 * BUG 3. The beach (and "a hot day") on a rainy day: weatherForOccasion (pair.ts:63-64)
 * overrides the temperature to 84, the summary to "warm", and the code to 0, and drops the
 * hourly read, but keeps the real day's `precipProb`. feelFromDaily turns that into popOut,
 * so the imagined hot day has rainTier 3: the plan demands a rain shell, sandals are ruled
 * out, and with no jacket clean the beach look goes out blocked: "the beach, 84° and warm.
 * A jacket for the rain, and nothing else is clean." The sky was cleared by half.
 * Fix: set `precipProb: 0` alongside `code: 0` in the hot branch (and decide the same
 * question for the cold branch, which keeps both the code and the chance of rain).
 */
test("fixed bug 3: the beach on a rainy 60 degree day is dressed for 84 and sunny, and then blocked for want of a rain jacket", () => {
  const rainy: Weather = { ...calmDay(60, { low: 52, popOut: 80, rain: true, precipHours: 5, sunFrac: 0.1 }), code: 63, summary: "rain" };
  const beach = parseOccasion("the beach");
  const climate = weatherForOccasion(rainy, beach);
  assert.equal(climate.code, 0, "the occasion clears the sky");
  const sneaker = testItem({ id: "sneaker", category: "shoes", name: "White Canvas Sneaker", subcategory: "sneaker", material: "canvas", warmth: 1, colorFamilies: '["white"]' });
  const look = pickLook({ items: [white(), navyShorts(), flipFlops(), sneaker], weather: rainy, skippedCombos: [], occasion: beach, dateKey: "2026-10-03:the beach" });
  assert.equal(look.blocked, undefined, `a tee and shorts at the beach are blocked: "${look.reason}"`);
  assert.equal(planDay(climate).rainTier, 0, "the imagined hot day still carries the real day's 80% chance of rain");
});

/**
 * BUG 4. With history, scoreLook depends on the order of the pieces and on whether a
 * hoodie cataloged as a top was handed over raw or as a layer. scoreLook normalizes the
 * stack for everything else, but passes the raw `pieces` to likeScore (pair.ts:279) and
 * rotationScore (pair.ts:282). Both call pairKind (kinds.ts:97-98), which takes the FIRST
 * piece of category "top": [tee, chino, hoodie] is "tee + chino", [hoodie, chino, tee] is
 * "hoodie + chino". And rotationScore charges a raw hoodie-top at the top rate (24 the next
 * day) while collectLooks hands it over as asLayer(hoodie), category "outer", charged 4.
 * So the same tee, chino, and hoodie worn yesterday score -196 forward, -191 reversed, and
 * -170 through pickLook; swapPiece (which passes raw pieces) and pickLook disagree about
 * the same stack.
 * Fix: call `likeScore(shoes ? [...items, shoes] : items, likes)` and the same for
 * rotationScore, i.e. the normalized stack, not `pieces`.
 */
test("fixed bug 4: with history, scoreLook changes with the order of the pieces and with how a hoodie-top layer is handed over", () => {
  const pieces = [white(), khakiChino(), hoodieTop()];
  const cool = calmDay(60, { low: 54 });
  const worn = [{ date: "2026-10-02", itemIds: pieces.map((item) => item.id) }];
  const recency = buildRecency(worn, "2026-10-03", { items: pieces });
  const score = (list: Item[]) => scoreLook(list, cool, everyday, DATE_KEY, undefined, false, undefined, recency).score;
  assert.equal(scoreLook([...pieces].reverse(), cool, everyday, DATE_KEY).score, scoreLook(pieces, cool, everyday, DATE_KEY).score, "sanity: without history the order does not matter");
  assert.equal(score([...pieces].reverse()), score(pieces), "the same three pieces, reversed");
  assert.equal(score([pieces[0], pieces[1], asLayer(pieces[2])]), score(pieces), "the same three pieces, the hoodie handed over as a layer (as pickLook does)");
});

/**
 * BUG 5. At the gym on a cold day the pick is a henley, chinos, and a wool overcoat, with a
 * jersey and athletic shorts clean. climate.ts waives the insulation and layer rules at the
 * gym ("The gym warms itself"), but scoreLook does not: the warmth target for the band
 * (pair.ts:292-294) takes 3 points for every warmth point under 12, so the kit loses 30
 * and the street clothes under a coat lose 12, the layer bonus (pair.ts:295-296) adds 6
 * more for the coat, and CANON prices a jersey on athletic shorts at -15 (classic.ts:31)
 * even at the gym. Together that beats the 62-point gym vibe gap. Found by E3 before it
 * was narrowed to 58 and up (3 of 900: seeds 20261057, 20261544, 20261643). A Dri-Fit tee
 * as the kit top loses the same way on colder days (BATTLE2_SEED=1 seed 389: a waffle
 * henley, corduroys, and a cardigan at 59 overcast; BATTLE2_SEED=424242 seed 424387), and
 * a jersey kit loses to the same jersey on canvas work pants at 65 in drizzle on the canon
 * and palette alone (BATTLE2_SEED=2025 seed 2592, before E3 was narrowed to a Dri-Fit kit).
 * Fix: skip the WARMTH_BY_BAND floor (and the layer bonus) when `gym`, as the verdict
 * already does, and do not apply the everyday jersey-on-athletic-shorts canon at the gym.
 */
test("fixed bug 5: at the gym on a 47 degree day, chinos and a wool overcoat go out though a jersey and athletic shorts are clean", () => {
  const jersey = testItem({ id: "jersey", category: "top", name: "Orange Stripe Soccer Jersey", subcategory: "jersey", material: "polyester", pattern: "stripe", warmth: 1, formality: 1, colorFamilies: '["orange"]' });
  const henley = testItem({ id: "henley", category: "top", name: "Grey Short-Sleeve Henley", subcategory: "henley", material: "cotton", colorFamilies: '["grey"]' });
  const chino = testItem({ id: "chino", category: "bottom", name: "Navy Slim Chino", subcategory: "chino", material: "cotton twill", formality: 3 });
  const overcoat = testItem({ id: "overcoat", category: "outer", name: "White Wool Overcoat", subcategory: "coat", material: "wool", warmth: 4, formality: 4, rainOk: false, colorFamilies: '["white"]' });
  const items = [jersey, athleticShorts("orange"), henley, chino, overcoat];
  const look = pickLook({ items, weather: calmDay(47, { low: 43, sunFrac: 0.1 }), skippedCombos: [], occasion: parseOccasion("gym"), dateKey: "2026-10-03:gym" });
  const { bottom } = readLook(look.itemIds, items);
  assert.ok(bottom && isShort(bottom), `the gym look is ${idsOf(look.itemIds)}: "${look.reason}"`);
});

/**
 * BUG 6. The rain-shell gap recommends a jacket that cannot fill it. When the only rain
 * jackets are technical, gaps.ts:40-46 asks for "a waxed or nylon chore jacket", but the
 * gap closes only when some rain jacket is not isTechnical, and isTechnical (kinds.ts:149-150)
 * matches /nylon/. Buy the nylon chore jacket the label names and the gap stays, still
 * saying "The only jacket that takes rain is Black Track Jacket".
 * Fix: drop "or nylon" from the label, or judge gym kit by cut (track, windbreaker,
 * performance) rather than by the word nylon.
 */
test("fixed bug 6: the nylon chore jacket the rain-shell gap asks for does not close the gap", () => {
  const track = testItem({ id: "track", category: "outer", name: "Black Track Jacket", subcategory: "jacket", material: "polyester", rainOk: true, colorFamilies: '["black"]' });
  const closet = [white(), khakiChino(), track];
  const before = closetGaps(closet).find((gap) => gap.key === "rain shell");
  assert.match(before?.label ?? "", /chore jacket/, "the gap names a chore jacket");
  const bought = testItem({ id: "chore", category: "outer", name: "Navy Nylon Chore Jacket", subcategory: "jacket", material: "nylon", rainOk: true, warmth: 2 });
  const after = closetGaps([...closet, bought]).find((gap) => gap.key === "rain shell");
  assert.equal(after, undefined, `still a gap after buying it: "${after?.why}"`);
});

/**
 * BUG 7. The plain-shorts gap asks for one short and needs two. gaps.ts:130 opens the gap
 * while `plainShorts.length < 2`; the label is "A plain chino short" and the reason is "The
 * hot-day shorts are athletic, striped, or linen. One plain dark short ...". Buy that one
 * short and the same gap comes back with the same sentence, which is now false.
 * Fix: `plainShorts.length < 1`, or word the label and reason for a second pair.
 */
test("fixed bug 7: one plain chino short, as the gap asks, leaves the same gap with a reason that is no longer true", () => {
  const closet = [white(), khakiChino(), athleticShorts()];
  const before = closetGaps(closet).find((gap) => gap.key === "plain shorts");
  assert.match(before?.label ?? "", /^A plain chino short/);
  const after = closetGaps([...closet, navyShorts()]).find((gap) => gap.key === "plain shorts");
  assert.equal(after, undefined, `still a gap with a plain navy chino short in the closet: "${after?.why}"`);
});

/**
 * BUG 8. "Cotton jersey" is a fabric, not a jersey (kinds.ts says so, and pieceKind reads
 * the cut without the fabric), but two scoring rules in pair.ts test hay(), which includes
 * the material: the hike rule `/jersey|oxford|dress/` (pair.ts:205) and the dressy rule
 * `/(henley|tee|jersey|hoodie)/` (pair.ts:343). A plain tee in cotton jersey loses 10 on a
 * hike, and a polo in cotton jersey loses 10 at dinner, brunch, or an interview, against
 * the identical piece cataloged as "cotton".
 * Fix: test `pieceKind(top) === "jersey"` (and the kinds for henley, tee, hoodie) instead
 * of the raw text.
 */
test("fixed bug 8: a top cataloged as 'cotton jersey' fabric is scored as a sports jersey on a hike and at dinner", () => {
  const warm = calmDay(75, { low: 66 });
  const tee = (material: string) => white({ material });
  const polo = (material: string) => testItem({ id: "polo", category: "top", name: "Navy Pique Polo", subcategory: "polo", material, formality: 3 });
  const score = (top: Item, label: string) => scoreLook([top, khakiChino()], warm, parseOccasion(label), DATE_KEY).score;
  assert.equal(score(tee("cotton jersey"), "a hike"), score(tee("cotton"), "a hike"), "a tee on a hike");
  assert.equal(score(polo("cotton jersey"), "dinner"), score(polo("cotton"), "dinner"), "a polo at dinner");
});

/**
 * BUG 9. pieceKind matches keywords anywhere inside a word (kinds.ts:76, 84, 85, 89):
 * /tee/ matches "sTEEl", /vest/ matches "harVEST", /coat/ matches "COATed". A "Steel Blue
 * Performance Polo" is an athletic tee (so it loses its collar rules, its polo canon, and
 * takes the Dri-Fit house penalty); a "Harvest Gold Pocket Tee" is a jacket, layerRole
 * "shell", so stackVerdict refuses to put anything over it ("Nothing goes over a jacket")
 * and on a cold day it can only go out blocked. sleeveLength in the same file already uses
 * /\btee\b/.
 * Fix: word boundaries in readKind: /\btees?\b|t-shirt/, /\bvest\b/, /\b(over)?coat\b/.
 */
test("fixed bug 9: a colour name with 'tee', 'vest', or 'coat' inside it changes what a piece is", () => {
  const polo = testItem({ id: "polo", category: "top", name: "Steel Blue Performance Polo", subcategory: "polo", material: "polyester", formality: 3, colorFamilies: '["blue"]' });
  const tee = testItem({ id: "tee", category: "top", name: "Harvest Gold Pocket Tee", subcategory: "tee", material: "cotton", warmth: 1, colorFamilies: '["gold"]' });
  const hoodie = asLayer(hoodieTop());
  assert.equal(stackVerdict(white(), [hoodie]).ok, true, "sanity: a hoodie goes over a tee");
  const over = stackVerdict(tee, [hoodie]);
  assert.equal(over.ok, true, `a hoodie over a Harvest Gold tee: "${over.ok ? "" : over.why}"`);
  assert.equal(pieceKind(tee), "tee");
  assert.equal(pieceKind(polo), "polo");
});

/**
 * BUG 10. The first round's shoe fixes stop at blocked looks. collectLooks (pair.ts:467)
 * only filters the shoes through verdictForPlan when the clothes pass; when the clothes are
 * blocked (one long-sleeve tee clean on an 80 degree day) every pair is "legal" and the
 * choice falls back to shoeScore, which does not know the plan's shoe rules. So flip-flops
 * go out after a 52 degree morning (plan.sandals is false) with a runner clean, and canvas
 * goes out in heavy rain with a rain-ready pair clean: the first round's bugs 1a to 1d,
 * back for any look that is already blocked for its clothes.
 * Fix: split the three shoe rules out of verdictForPlan into a `shoeVerdict(shoe, plan)`
 * and filter the pairs with it whether or not the clothes pass.
 */
test("fixed bug 10: when the clothes are blocked, flip-flops go out after a 52 degree morning though the plan rules sandals out and a runner is clean", () => {
  const runner = testItem({ id: "runner", category: "shoes", name: "Grey Mesh Runner", subcategory: "running shoe", material: "mesh", warmth: 1, rainOk: false, colorFamilies: '["grey"]' });
  const items = [greyLongSleeve(), navyShorts(), flipFlops(), runner];
  const weather = calmDay(80, { low: 52, coolHours: 3 });
  const plan = planDay(weather);
  assert.equal(plan.sandals, false, "the plan rules sandals out");
  const look = pickLook({ items, weather, skippedCombos: [], dateKey: DATE_KEY });
  assert.match(look.blocked ?? "", /long sleeve/i, "the clothes are blocked: the only top is a long sleeve");
  const { shoes } = readLook(look.itemIds, items);
  assert.notEqual(shoes[0]?.id, "flip", `flip-flops on a blocked look: ${idsOf(look.itemIds)}`);
});
