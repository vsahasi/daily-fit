import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOccasion } from "@/lib/occasion";
import { readScenario } from "@/lib/scenario";

const ctx = { today: "2026-10-12", timezone: "America/Los_Angeles", home: "Berkeley, California, United States" };

const answer = (over: Record<string, unknown> = {}) => async () =>
  JSON.stringify({
    vibe: "everyday",
    targetFormality: 2,
    dressy: false,
    allowShorts: false,
    tags: ["house"],
    climate: "cold",
    when: "night",
    dayOffset: 0,
    place: null,
    temps: null,
    ...over,
  });

test("the model's brief is read onto the occasion, with the label as typed", async () => {
  const o = await readScenario("  Late night cold ", { ...ctx, ask: answer() });
  assert.equal(o.label, "Late night cold");
  assert.equal(o.vibe, "everyday");
  assert.equal(o.targetFormality, 2);
  assert.equal(o.dressy, false);
  assert.equal(o.allowShorts, false);
  assert.deepEqual(o.tags, ["house"]);
  assert.equal(o.climate, "cold");
  assert.equal(o.when, "night");
  assert.equal(o.dayOffset, undefined);
  assert.equal(o.place, undefined);
  assert.equal(o.temps, undefined);
});

test("a place, a day, and stated temperatures come through", async () => {
  const o = await readScenario("Boston on Thursday, 45 degrees", {
    ...ctx,
    ask: answer({ place: "Boston", dayOffset: 3, temps: { high: 45, low: 38 }, climate: "forecast" }),
  });
  assert.equal(o.place, "Boston");
  assert.equal(o.dayOffset, 3);
  assert.deepEqual(o.temps, { high: 45, low: 38 });
});

test("a place that is home is dropped", async () => {
  const o = await readScenario("dinner in berkeley", { ...ctx, ask: answer({ place: "Berkeley" }) });
  assert.equal(o.place, undefined);
});

test("numbers outside their ranges are clamped and unknown tags are dropped", async () => {
  const o = await readScenario("x", { ...ctx, ask: answer({ targetFormality: 9, dayOffset: 40, tags: ["house", "rave", "gym"] }) });
  assert.equal(o.targetFormality, 5);
  assert.equal(o.dayOffset, 6);
  assert.deepEqual(o.tags, ["house", "gym"]);
});

test("a formality of 4 or more is a dressy brief whatever the model said", async () => {
  const o = await readScenario("x", { ...ctx, ask: answer({ targetFormality: 4, dressy: false, vibe: "dressy" }) });
  assert.equal(o.dressy, true);
});

test("when the model throws, the keyword reader answers", async () => {
  const o = await readScenario("Hot day tomorrow", {
    ...ctx,
    ask: async () => {
      throw new Error("down");
    },
  });
  assert.deepEqual(o, parseOccasion("Hot day tomorrow"));
});

test("when the model returns something that is not a brief, the keyword reader answers", async () => {
  const garbage = await readScenario("job interview", { ...ctx, ask: async () => "not json" });
  assert.deepEqual(garbage, parseOccasion("job interview"));
  const wrongShape = await readScenario("job interview", { ...ctx, ask: answer({ vibe: "rave" }) });
  assert.deepEqual(wrongShape, parseOccasion("job interview"));
});

test("without a model the keyword reader answers", async () => {
  const o = await readScenario("the gym", { ...ctx, ask: null });
  assert.deepEqual(o, parseOccasion("the gym"));
});

test("the model is told the text, the date, and the home city", async () => {
  let seen = "";
  await readScenario("drinks Friday", {
    ...ctx,
    ask: async (prompt: string) => {
      seen = prompt;
      return answer()();
    },
  });
  assert.match(seen, /drinks Friday/);
  assert.match(seen, /2026-10-12/);
  assert.match(seen, /Berkeley/);
});
