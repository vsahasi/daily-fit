import assert from "node:assert/strict";
import { test } from "node:test";
import { bandFor, planDay } from "@/lib/bands";
import type { DayFeel, Weather } from "@/lib/types";

const base: Weather = { date: "2026-09-29", tempMin: 51, tempMax: 77, precipProb: 0, code: 1, summary: "clear", locationLabel: "Berkeley" };
const feel = (over: Partial<DayFeel>): DayFeel => ({
  high: 76, low: 54, lowEff: 53, dawn: 54, swing: 22, coolHours: 2, eveningEff: 63, windMax: 7, sunFrac: 0.92,
  popOut: 0, precipHours: 0, drizzle: false, rain: false, heavyRain: false, fog: false, fogPastNoon: false,
  ...over,
});

test("bands split at 85, 78, 71, 65, 58, and 50", () => {
  assert.equal(bandFor(90), "scorching");
  assert.equal(bandFor(80), "hot");
  assert.equal(bandFor(71), "warm");
  assert.equal(bandFor(70), "mild");
  assert.equal(bandFor(60), "cool");
  assert.equal(bandFor(50), "cold");
  assert.equal(bandFor(49), "freezing");
});

test("the Berkeley day: 76 in the afternoon after a 54 morning is a short sleeve with one carried layer", () => {
  const plan = planDay({ ...base, feel: feel({}) });
  assert.equal(plan.band, "warm");
  assert.equal(plan.sleeves, "short");
  assert.equal(plan.trigger, true);
  assert.deepEqual([plan.layers.min, plan.layers.max, plan.layers.removable], [1, 1, true], "a 54 dawn makes the carried layer part of the look");
  const softer = planDay({ ...base, feel: feel({ dawn: 57, lowEff: 55 }) });
  assert.deepEqual([softer.layers.min, softer.layers.max], [0, 1], "a 57 dawn leaves it optional");
});

test("a steady 76 with a 64 morning gets no layer at all", () => {
  const plan = planDay({ ...base, feel: feel({ lowEff: 64, dawn: 66, swing: 10, coolHours: 0, eveningEff: 66 }) });
  assert.equal(plan.trigger, false);
  assert.equal(plan.layers.max, 0);
});

test("from 80 nothing goes over a short sleeve whatever the morning did", () => {
  const plan = planDay({ ...base, feel: feel({ high: 82, lowEff: 50, coolHours: 3 }) });
  assert.equal(plan.layers.max, 0);
  assert.equal(plan.knitTop, false);
});

test("an overcast day dresses five degrees colder", () => {
  const sunny = planDay({ ...base, feel: feel({ high: 72, sunFrac: 0.9 }) });
  const grey = planDay({ ...base, feel: feel({ high: 72, sunFrac: 0.2 }) });
  assert.equal(sunny.band, "warm");
  assert.equal(grey.band, "mild");
});

test("mild days want a layer when the morning is cool, and allow a long sleeve alone", () => {
  const plan = planDay({ ...base, feel: feel({ high: 68, lowEff: 52 }) });
  assert.equal(plan.band, "mild");
  assert.equal(plan.sleeves, "any");
  assert.equal(plan.layers.min, 1, "the cool morning makes the layer required");
  const easy = planDay({ ...base, feel: feel({ high: 68, lowEff: 61, coolHours: 0, swing: 8, eveningEff: 62 }) });
  assert.equal(easy.layers.max, 0);
});

test("cool days need one warm piece, cold days a long sleeve or a mid, freezing days three pieces", () => {
  assert.equal(planDay({ ...base, feel: feel({ high: 61, lowEff: 55 }) }).insulation, "one");
  const cold = planDay({ ...base, feel: feel({ high: 54, lowEff: 46 }) });
  assert.equal(cold.insulation, "long-or-mid");
  assert.equal(cold.layers.shell, "required", "a 46 felt low wants an outer piece");
  const freezing = planDay({ ...base, feel: feel({ high: 46, lowEff: 40 }) });
  assert.equal(freezing.insulation, "three");
  assert.equal(freezing.layers.shell, "required");
  assert.equal(freezing.layers.min, 2, "a base, a mid, and a jacket");
  assert.equal(freezing.layers.windBlock, false, "a still day is cold, not windy");
  assert.equal(planDay({ ...base, feel: feel({ high: 46, lowEff: 36, windMax: 14 }) }).layers.windBlock, true);
});

test("rain tiers: a shell from 50 percent, no fleece bottoms from 70", () => {
  const dry = planDay({ ...base, feel: feel({ high: 60 }) });
  assert.equal(dry.rainTier, 0);
  const wet = planDay({ ...base, feel: feel({ high: 60, popOut: 55, rain: true }) });
  assert.equal(wet.rainTier, 2);
  assert.equal(wet.layers.shell, "required");
  assert.equal(wet.wetShoesOut, true);
  const pouring = planDay({ ...base, feel: feel({ high: 55, popOut: 80, rain: true }) });
  assert.equal(pouring.fleece, "no");
});

test("shorts, sandals, and linen follow their floors", () => {
  assert.equal(planDay({ ...base, feel: feel({ high: 76, lowEff: 62 }) }).sandals, true);
  assert.equal(planDay({ ...base, feel: feel({ high: 76, lowEff: 52 }) }).sandals, false);
  assert.equal(planDay({ ...base, feel: feel({ high: 68, lowEff: 60, sunFrac: 0.9 }) }).shorts, "athletic");
  assert.equal(planDay({ ...base, feel: feel({ high: 68, lowEff: 60, sunFrac: 0.2 }) }).shorts, "no");
  assert.equal(planDay({ ...base, feel: feel({ high: 56 }) }).shorts, "no");
  assert.equal(planDay({ ...base, feel: feel({ high: 56 }) }, { gym: true }).shorts, "yes");
  assert.equal(planDay({ ...base, feel: feel({ high: 60 }) }).linenBottoms, false);
  assert.equal(planDay({ ...base, feel: feel({ high: 60 }) }).linenShirtAlone, false);
});

test("without an hourly read, the daily numbers still make a plan", () => {
  const plan = planDay({ ...base, tempMax: 72, tempMin: 55, code: 3 });
  assert.equal(plan.band, "mild", "overcast 72 dresses like 67");
});
