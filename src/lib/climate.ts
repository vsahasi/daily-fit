import type { Item } from "@prisma/client";
import { planDay, type DayPlan } from "@/lib/bands";
import { families, hay, isShort } from "@/lib/garment";
import { pieceKind, sleeveLength } from "@/lib/kinds";
import { isMidKind, isOpenShirt, isShellKind, layerKind, removableRank, stackVerdict } from "@/lib/layering";
import type { Occasion } from "@/lib/occasion";
import { mainColor } from "@/lib/palette";
import { register } from "@/lib/register";
import { shoeKind } from "@/lib/shoes";
import type { Weather } from "@/lib/types";

export type Verdict = { ok: true } | { ok: false; why: string };

const KNIT_TOPS = new Set(["ss sweater", "knit polo", "sweater", "chunky sweater", "knit henley"]);

function isLinen(item: Item) {
  return /linen/.test(hay(item));
}

/** A top that keeps you warm on its own: a warm long sleeve, or a mid layer worn as the top. */
function insulating(top: Item) {
  return sleeveLength(top) === "long" && (top.warmth >= 3 || isMidKind(top));
}

/** Woven or dense enough to stop wind. A knit bomber or a fleece is not. */
function blocksWind(item: Item) {
  return ["zip shell", "shirt jacket", "coat"].includes(layerKind(item));
}

/**
 * Rules the forecast never bends, from the day plan. A look that breaks one is not
 * scored low, it is out, as long as some other clean look can pass. `climate` is the
 * forecast after the occasion has had its say, so the beach counts as hot and "a cold
 * day" as cold.
 */
export function climateVerdict(pieces: Item[], climate: Weather, occasion: Occasion): Verdict {
  const gym = occasion.vibe === "gym";
  const plan = planDay(climate, { gym });
  return verdictForPlan(pieces, plan, { gym, formal: occasion.dressy && occasion.targetFormality >= 4 });
}

export type Violation = { why: string; weight: number };

/** The first rule a look breaks, heaviest first. `formal`: an interview or a wedding, where a long-sleeve shirt goes out whatever the heat. */
export function verdictForPlan(pieces: Item[], plan: DayPlan, opts: { gym?: boolean; formal?: boolean } = {}): Verdict {
  const all = violationsForPlan(pieces, plan, opts);
  if (!all.length) return { ok: true };
  return { ok: false, why: all.reduce((worst, next) => (next.weight > worst.weight ? next : worst)).why };
}

/** How badly a look breaks the day, summed. When nothing clean passes, the least bad look goes out. */
export function violationWeight(pieces: Item[], plan: DayPlan, opts: { gym?: boolean; formal?: boolean } = {}) {
  return violationsForPlan(pieces, plan, opts).reduce((sum, row) => sum + row.weight, 0);
}

/** The shoe rules on their own, so a look that is already wrong still goes out in the right pair. */
export function shoeViolations(shoe: Item, plan: DayPlan): Violation[] {
  const out: Violation[] = [];
  const sandal = shoeKind(shoe) === "sandal";
  if (plan.wetShoesOut && !shoe.rainOk) out.push({ why: `${shoe.name} in the rain`, weight: 4 });
  else if (plan.rainTier >= 1 && plan.wet && !shoe.rainOk) out.push({ why: `${shoe.name} in the drizzle`, weight: 2 });
  if (plan.rainTier >= 1 && sandal) out.push({ why: "Flip-flops in the rain", weight: 8 });
  else if (sandal && !plan.sandals) {
    out.push({ why: plan.lowEff < 60 ? `Flip-flops on a ${plan.dawn}° morning` : `Flip-flops at ${plan.airHigh}°`, weight: 8 });
  }
  return out;
}

/** Black, charcoal, or navy and nothing else. */
export function isBlackShoe(shoe: Item) {
  const colours = families(shoe);
  return colours.length > 0 && colours.every((c) => ["black", "charcoal", "navy"].includes(c));
}

/** His rule: never a black shoe under brown trousers. */
export const BLACK_ON_BROWN: Violation = { why: "Black shoes under brown trousers", weight: 7 };

export function clashesWithBrown(shoe: Item, bottom: Item) {
  return isBlackShoe(shoe) && mainColor(bottom) === "brown";
}

/**
 * Every rule a look breaks, each with a weight: 10 for the ones nobody would walk out in
 * (shorts in the cold, linen in the rain, no jacket in a downpour), less for the ones a
 * thin closet sometimes forces (a jacket that is not rain-safe, a layer that does not zip).
 */
export function violationsForPlan(pieces: Item[], plan: DayPlan, opts: { gym?: boolean; formal?: boolean } = {}): Violation[] {
  const clothes = pieces.filter((item) => item.category !== "shoes" && item.category !== "accessory");
  const top = clothes.find((item) => item.category === "top");
  const bottom = clothes.find((item) => item.category === "bottom");
  const layers = clothes.filter((item) => item.category === "outer");
  const shoe = pieces.find((item) => item.category === "shoes");
  const out: Violation[] = [];
  const add = (why: string, weight: number) => out.push({ why, weight });
  if (!top || !bottom) return out;
  const H = plan.high;
  const A = plan.airHigh;

  // The stack has to be a stack.
  const stack = stackVerdict(top, layers);
  if (!stack.ok) add(stack.why, 8);

  // The top.
  const kind = layerKind(top);
  const dressShirt = opts.formal && (kind === "shirt" || kind === "linen shirt");
  if (plan.sleeves === "short" && sleeveLength(top) === "long" && !dressShirt) add(`A long sleeve at ${A}°`, 8);
  const knitTop = KNIT_TOPS.has(kind);
  if ((plan.band === "hot" || plan.band === "scorching") && knitTop) add(`${top.name} at ${A}°`, 6);
  const knitPass = plan.knitTop && knitTop && sleeveLength(top) === "short" && top.warmth <= 3;
  const henleyPass = plan.henleyTop && (kind === "thermal henley" || kind === "knit henley") && top.warmth <= 3;
  if (top.warmth > plan.topMaxWarmth && !knitPass && !henleyPass && !dressShirt) add(`${top.name} is too warm for ${A}°`, 6);
  if (A >= 86 && !opts.formal && ["polo", "knit polo", "shirt"].includes(kind)) add(`${top.name} at ${A}°`, 4);
  if (H >= 71) {
    const heavy = clothes.find((item) => item.warmth >= 4);
    if (heavy) add(`${heavy.name} is too heavy for ${A}°`, 6);
  } else if (A >= 68 && bottom.warmth >= 4) {
    add(`${bottom.name} is too heavy for ${A}°`, 5);
  }

  // How many layers, and what they are for. The gym warms itself.
  // A short-sleeve linen shirt worn open over a tee is how a layer is worn in the heat: it does not count as one.
  const breezy = layers.length === 1 && isOpenShirt(layers[0]) && isLinen(layers[0]) && sleeveLength(layers[0]) === "short" && A >= 71;
  if (layers.length > plan.layers.max && !breezy) add(layers.length === 1 ? `A layer at ${A}°` : `Two layers at ${A}°`, 6);
  if (layers.some((layer) => isOpenShirt(layer) && isLinen(layer)) && !plan.linenShirt) add(`Linen at ${A}°`, 8);
  // A short-sleeve shirt worn open is a look, not warmth: it does not answer a cool morning.
  const thin = layers.find((layer) => isOpenShirt(layer) && sleeveLength(layer) === "short");
  if (thin && !opts.gym && (plan.layers.min >= 1 || plan.lowEff < 58)) add(`${thin.name} is no layer for a ${plan.dawn}° morning`, 6);
  if (!opts.gym) {
    switch (plan.insulation) {
      case "one":
        if (!insulating(top) && layers.length === 0) {
          add(sleeveLength(top) === "short" ? `A short sleeve alone at ${A}°` : `Nothing warm at ${A}°`, 6);
        } else if (plan.lowEff <= 48 && layers.length === 1 && sleeveLength(top) === "short") {
          // A felt low in the 40s: a tee under one open jacket is thin.
          add(`A short sleeve under one layer on a ${plan.lowEff}° morning`, 5);
        }
        break;
      case "long-or-mid":
        if (sleeveLength(top) === "short" && !layers.some(isMidKind)) add(`A short sleeve with no mid layer at ${A}°`, 6);
        break;
      case "three":
        if (!(layers.some(isMidKind) || (!plan.strictThree && insulating(top)))) add(`Three pieces at ${A}°`, 5);
        if (plan.strictThree && isMidKind(top)) add(`A base under the mid at ${A}°`, 3);
        break;
      default:
        break;
    }
    if (layers.length < plan.layers.min) {
      add(plan.rainTier >= 2 ? "A jacket for the rain" : `A layer for the ${plan.dawn}° morning`, 6);
    }
  }
  const outermost = layers[layers.length - 1];
  const needsShell = !opts.gym && plan.layers.shell === "required";
  if (needsShell && !outermost) {
    add(plan.rainTier >= 2 ? "No jacket in the rain" : plan.windMax >= 15 ? `No jacket in a ${plan.windMax} mph wind` : `No jacket on a ${plan.dawn}° morning`, 10);
  } else if (needsShell && outermost && !isShellKind(outermost)) {
    add(plan.rainTier >= 2 ? `${outermost.name} is not a rain jacket` : `${outermost.name} is not a jacket`, 6);
  }
  // Rain first: in drizzle the outermost piece is rain-safe or wool; in real rain it is rain-safe.
  if (outermost && !outermost.rainOk) {
    if (plan.rainTier >= 2) add(`${outermost.name} in the rain`, layerKind(outermost) === "shirt jacket" ? 2 : 4);
    else if (plan.rainTier >= 1 && plan.wet) add(`${outermost.name} in the drizzle`, layerKind(outermost) === "shirt jacket" ? 2 : 3);
  }
  if (!opts.gym && plan.layers.windBlock && plan.layers.max >= 1 && plan.layers.shell !== "no" && outermost && !blocksWind(outermost)) {
    add(plan.windMax >= 15 ? `${outermost.name} in a ${plan.windMax} mph wind` : `${outermost.name} does not stop the cold at ${A}°`, 2);
  }
  for (const layer of layers) {
    if (layer.warmth > plan.layers.maxWarmth && !(plan.band === "cool" && layerKind(layer) === "shirt jacket")) {
      add(`${layer.name} is too heavy for ${A}°`, 5);
    }
    if (plan.layers.removable && !breezy && removableRank(layer, A) == null) add(`${layer.name} does not come off by 10am`, 3);
  }
  // Shorts and a layer contradict each other once the morning is properly cool.
  if (!opts.gym && isShort(bottom) && layers.length && plan.lowEff < 55) add(`Shorts under a jacket on a ${plan.dawn}° morning`, 8);
  if (plan.rainTier >= 2 && clothes.some(isLinen)) add("Linen in the rain", 10);
  if (shoe) {
    out.push(...shoeViolations(shoe, plan));
    if (!opts.gym && clashesWithBrown(shoe, bottom)) out.push(BLACK_ON_BROWN);
  }
  // A formal day has a floor.
  if (opts.formal) {
    if (register(bottom) < 4) add(`${bottom.name} is not dressy enough`, 5);
    if (!["shirt", "linen shirt", "polo", "knit polo"].includes(kind)) add(`${top.name} is not dressy enough`, 5);
  }

  // Bottoms.
  if (plan.band === "scorching" && !isShort(bottom) && bottom.warmth >= 3 && !isLinen(bottom) && !opts.gym && !opts.formal) {
    add(`Long pants at ${A}°`, 4);
  }
  if (clothes.some(isLinen) && layers.some((layer) => /fleece|wool|hoodie|bomber|shirt jacket|knit blend/.test(hay(layer)) || isMidKind(layer))) {
    add("Linen under a warm layer", 6);
  }
  if (isShort(bottom)) {
    if (plan.shorts === "no") add(`Shorts at ${A}°`, 10);
    else if (plan.shorts === "athletic" && pieceKind(bottom) !== "athletic short") add(`${bottom.name} at ${A}°`, 5);
  }
  if (pieceKind(bottom) === "sweatpant") {
    if (plan.fleece === "no") add(`Sweatpants at ${A}°`, 5);
    else if (plan.fleece === "joggers" && bottom.warmth >= 4) add(`Fleece sweatpants at ${A}°`, 5);
  }
  if (isLinen(bottom) && !plan.linenBottoms) add(`Linen at ${A}°`, 10);
  if (isLinen(top)) {
    if (!plan.linenShirt) add(`Linen at ${A}°`, 8);
    else if (plan.band === "cool" && sleeveLength(top) === "short") add(`A short-sleeve linen shirt at ${A}°`, 6);
    else if (!plan.linenShirtAlone && layers.length === 0) add(`A linen shirt alone at ${A}°`, 6);
  }
  return out;
}

/** The day is warm enough that only short sleeves go out. */
export function isHot(weather: Weather) {
  return planDay(weather).sleeves === "short";
}

/** The day drops drastically: a cool morning, a cold evening, or a big swing. */
export function dropsDrastically(weather: Weather) {
  return planDay(weather).trigger;
}
