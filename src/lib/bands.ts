import type { DayFeel, Weather } from "@/lib/types";
import { feelFromDaily } from "@/lib/weather";

/**
 * Temperature bands by the air high over the hours out, from the weather research:
 * 85 and up, 78 to 84, 71 to 77, 65 to 70, 58 to 64, 50 to 57, under 50.
 */
export type Band = "scorching" | "hot" | "warm" | "mild" | "cool" | "cold" | "freezing";

export function bandFor(high: number): Band {
  if (high >= 85) return "scorching";
  if (high >= 78) return "hot";
  if (high >= 71) return "warm";
  if (high >= 65) return "mild";
  if (high >= 58) return "cool";
  if (high >= 50) return "cold";
  return "freezing";
}

export type LayerPlan = {
  min: 0 | 1 | 2;
  max: 0 | 1 | 2;
  /** The layer is there to come off by ten: a zip or a shirt jacket, not a pullover. */
  removable: boolean;
  maxWarmth: number;
  /** The outermost layer must block wind: a woven jacket or a shirt jacket, never fleece alone. */
  windBlock: boolean;
  shell: "no" | "optional" | "required";
};

export type DayPlan = {
  band: Band;
  /** The air high, less five when the day is overcast or the wind is strong. */
  high: number;
  /** The air high, unshifted. The wearer's above-70 rule reads this one. */
  airHigh: number;
  /** The felt low over the hours out, as the hourly read gives it. */
  lowEff: number;
  /** Air temperature at 8am. */
  dawn: number;
  windMax: number;
  /** Rain or drizzle falls during the hours out. */
  wet: boolean;
  /** Below 50 for real: a base, a mid, and a jacket, nothing less. */
  strictThree: boolean;
  /** No sun to speak of: the morning layer does not come off at ten. */
  overcast: boolean;
  /** Felt temperature around 7 to 8pm, for an evening out. */
  evening: number;
  /** A waffle or knit henley alone is right at the cool end of mild, after a cool morning. */
  henleyTop: boolean;
  /** The day drops drastically: a cool morning, a cold evening, or a big swing. */
  trigger: boolean;
  rainTier: 0 | 1 | 2 | 3;
  /** "short": the top must be short-sleeved. */
  sleeves: "short" | "any";
  /** Warmest top allowed on its own. */
  topMaxWarmth: number;
  /** A short-sleeve knit polo or knit sweater of warmth 3 passes as the top. */
  knitTop: boolean;
  /** none: nothing warm. one: something warm somewhere. long-or-mid: a long sleeve, or a tee under a mid layer. three: base, mid, and a wind-blocking outer. */
  insulation: "none" | "one" | "long-or-mid" | "three";
  layers: LayerPlan;
  shorts: "no" | "athletic" | "yes";
  sandals: boolean;
  linenShirt: boolean;
  linenShirtAlone: boolean;
  linenBottoms: boolean;
  /** no: no fleece bottoms. joggers: joggers but not sweatpants. yes: both. */
  fleece: "no" | "joggers" | "yes";
  /** Knit and mesh shoes stay home. */
  wetShoesOut: boolean;
};

export function feelOf(weather: Weather): DayFeel {
  return weather.feel ?? feelFromDaily(weather);
}

/** The forecast turned into what the day asks for. `gym` days keep their shorts. */
export function planDay(weather: Weather, opts: { gym?: boolean } = {}): DayPlan {
  const feel = feelOf(weather);
  const overcast = feel.sunFrac < 0.35 || feel.fogPastNoon;
  const strongWind = feel.windMax >= 20 && feel.high < 85;
  const high = feel.high - (overcast ? 5 : 0) - (strongWind ? 5 : 0);
  const lowEff = feel.lowEff;
  // Wind and a sunless sky make the cool hours bite harder; that only moves the trigger.
  const lowForTrigger = lowEff - (feel.windMax >= 12 ? 5 : 0) - (overcast ? 5 : 0);
  const trigger = lowForTrigger <= 55 || feel.coolHours >= 3 || feel.swing >= 20 || feel.eveningEff <= 55;
  const rainTier: 0 | 1 | 2 | 3 =
    feel.popOut >= 70 || feel.heavyRain
      ? 3
      : feel.popOut >= 50 || feel.precipHours >= 2
        ? 2
        : feel.popOut >= 30 || feel.drizzle || feel.rain
          ? 1
          : 0;
  const band = bandFor(high);
  const windBlock = feel.windMax >= 15;
  const sandals = high >= 70 && lowEff >= 60 && feel.popOut < 30;
  const wetShoesOut = rainTier >= 2;
  const linenBottoms = high >= 62 && lowEff >= 55 && feel.popOut < 50 && rainTier < 2;
  const common = {
    band, high, airHigh: feel.high, lowEff, dawn: feel.dawn, trigger, rainTier, windMax: feel.windMax,
    wet: feel.drizzle || feel.rain, strictThree: false, overcast, evening: feel.eveningEff,
    henleyTop: false,
  };

  const none: LayerPlan = { min: 0, max: 0, removable: true, maxWarmth: 3, windBlock, shell: "no" };
  const rainShell: LayerPlan = { min: 1, max: 1, removable: true, maxWarmth: 3, windBlock, shell: "required" };
  const carried: LayerPlan = { min: 0, max: 1, removable: true, maxWarmth: lowEff <= 50 ? 4 : 3, windBlock, shell: "optional" };

  let plan: DayPlan;
  switch (band) {
    case "scorching":
    case "hot":
      plan = {
        ...common,
        sleeves: "short",
        topMaxWarmth: 2,
        knitTop: false,
        insulation: "none",
        layers: rainTier >= 2 ? rainShell : none,
        shorts: "yes",
        sandals,
        linenShirt: true,
        linenShirtAlone: true,
        linenBottoms,
        fleece: "no",
        wetShoesOut,
      };
      break;
    case "warm":
      plan = {
        ...common,
        sleeves: "short",
        topMaxWarmth: 2,
        knitTop: false,
        insulation: "none",
        // A properly cold dawn makes the carried layer part of the look, not an option.
        layers: rainTier >= 2 ? rainShell : trigger ? { ...carried, min: feel.dawn <= 54 ? 1 : 0 } : none,
        shorts: "yes",
        sandals,
        linenShirt: true,
        linenShirtAlone: true,
        linenBottoms,
        fleece: "no",
        wetShoesOut,
      };
      break;
    case "mild":
      plan = {
        ...common,
        sleeves: "any",
        topMaxWarmth: 2,
        henleyTop: high <= 66 && lowEff <= 58,
        knitTop: true,
        insulation: "none",
        layers:
          rainTier >= 2
            ? rainShell
            : trigger
              ? { ...carried, min: 1 }
              : lowEff <= 58
                ? carried
                : none,
        shorts: feel.sunFrac >= 0.6 && lowEff >= 58 ? "athletic" : "no",
        sandals,
        linenShirt: true,
        linenShirtAlone: true,
        linenBottoms,
        fleece: high <= 65 ? "joggers" : "no",
        wetShoesOut,
      };
      break;
    case "cool": {
      const outer = rainTier >= 2 || windBlock;
      plan = {
        ...common,
        sleeves: "any",
        topMaxWarmth: high <= 60 ? 4 : 3,
        knitTop: true,
        insulation: "one",
        layers: {
          min: outer ? 1 : 0,
          // A felt low in the 40s on a cool day wants a mid under the jacket.
          max: lowEff <= 48 ? 2 : 1,
          removable: false,
          // The heaviest knits wait for 60 and under; the wool shirt jacket is exempt, worn open.
          maxWarmth: high <= 60 ? 4 : 3,
          windBlock,
          shell: outer ? "required" : "optional",
        },
        shorts: feel.sunFrac >= 0.6 && lowEff >= 55 ? "athletic" : "no",
        sandals: false,
        linenShirt: true,
        linenShirtAlone: false,
        linenBottoms: false,
        fleece: high <= 60 ? "yes" : "joggers",
        wetShoesOut,
      };
      break;
    }
    case "cold": {
      const outer = lowEff <= 48 || feel.windMax >= 12 || feel.popOut >= 50;
      plan = {
        ...common,
        sleeves: "any",
        topMaxWarmth: 5,
        knitTop: true,
        insulation: "long-or-mid",
        layers: { min: outer ? 1 : 0, max: 2, removable: false, maxWarmth: 5, windBlock, shell: outer ? "required" : "optional" },
        shorts: "no",
        sandals: false,
        linenShirt: false,
        linenShirtAlone: false,
        linenBottoms: false,
        fleece: rainTier >= 3 ? "no" : "yes",
        wetShoesOut,
      };
      break;
    }
    default: {
      const strictThree = feel.high < 50 || lowEff <= 42 || (rainTier >= 2 && lowEff <= 45);
      plan = {
        ...common,
        strictThree,
        sleeves: "any",
        topMaxWarmth: 5,
        knitTop: true,
        insulation: "three",
        layers: { min: strictThree ? 2 : 1, max: 2, removable: false, maxWarmth: 5, windBlock: feel.windMax >= 12, shell: "required" },
        shorts: "no",
        sandals: false,
        linenShirt: false,
        linenShirtAlone: false,
        linenBottoms: false,
        fleece: rainTier >= 3 ? "no" : "yes",
        wetShoesOut,
      };
    }
  }

  // The wearer's rule reads the air, not the shifted number: above 70 the top is a short sleeve.
  if (feel.high > 70) {
    plan.sleeves = "short";
    plan.topMaxWarmth = Math.min(plan.topMaxWarmth, 2);
    plan.knitTop = false;
  }
  // Heat wins over every trigger except real rain: from 80 nothing goes over a short sleeve.
  if (feel.high >= 80 && rainTier < 2) plan.layers = none;
  if (rainTier >= 3) plan.fleece = "no";
  if (opts.gym) plan.shorts = "yes";
  // A required layer on a morning under 55 rules shorts out; say so rather than promise them.
  else if (plan.layers.min >= 1 && lowEff < 55) plan.shorts = "no";
  return plan;
}
