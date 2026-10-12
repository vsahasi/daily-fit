import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOccasion } from "@/lib/occasion";

// The four lines actually typed into the Event page in September and October 2026, which
// all came back as "dressy, formality 3, today's forecast".

test("'Late night cold' is a cold night, not a dressy evening", () => {
  const o = parseOccasion("Late night cold");
  assert.equal(o.climate, "cold");
  assert.equal(o.when, "night");
  assert.equal(o.dressy, false);
  assert.equal(o.allowShorts, false);
});

test("'Hot day tomorrow' is a hot day, dressed for tomorrow", () => {
  const o = parseOccasion("Hot day tomorrow");
  assert.equal(o.climate, "hot");
  assert.equal(o.dayOffset, 1);
  assert.equal(o.dressy, false);
});

test("'Late night studying' is casual, not dressy", () => {
  const o = parseOccasion("Late night studying");
  assert.equal(o.vibe, "everyday");
  assert.equal(o.dressy, false);
  assert.ok(o.targetFormality <= 2, `formality ${o.targetFormality}`);
  assert.equal(o.when, "night");
});

test("'Boston day 1 (cold)' is cold and casual, with no shorts", () => {
  const o = parseOccasion("Boston day 1 (cold)");
  assert.equal(o.climate, "cold");
  assert.equal(o.dressy, false);
  assert.equal(o.allowShorts, false);
});

test("text that names nothing is an everyday brief, not a dressy one", () => {
  const o = parseOccasion("a thing on Thursday");
  assert.equal(o.vibe, "everyday");
  assert.equal(o.dressy, false);
  assert.equal(o.targetFormality, 3);
});

test("'run errands' is everyday, not the gym", () => {
  assert.equal(parseOccasion("run errands").vibe, "everyday");
  assert.equal(parseOccasion("a morning run").vibe, "gym");
});

test("'dinner tonight' is a dressy evening today", () => {
  const o = parseOccasion("dinner tonight");
  assert.equal(o.dressy, true);
  assert.equal(o.when, "evening");
  assert.equal(o.dayOffset ?? 0, 0);
});

test("the named occasions keep their briefs", () => {
  assert.equal(parseOccasion("job interview").targetFormality, 4);
  assert.equal(parseOccasion("job interview").dressy, true);
  assert.equal(parseOccasion("gym").vibe, "gym");
  assert.equal(parseOccasion("the beach").vibe, "beach");
  assert.equal(parseOccasion("a wedding").targetFormality, 5);
});

test("the label is the text as typed", () => {
  assert.equal(parseOccasion("  Late night cold ").label, "Late night cold");
});

test("describeOccasion says what was read, in a short line", async () => {
  const { describeOccasion } = (await import("@/lib/occasion")) as unknown as { describeOccasion: (o: ReturnType<typeof parseOccasion>) => string };
  // The keyword reader cannot tell a casual night from an ordinary one; the model can.
  assert.equal(describeOccasion(parseOccasion("Late night cold")), "everyday, at night, in the cold");
  assert.equal(describeOccasion({ ...parseOccasion("Late night cold"), targetFormality: 2 }), "casual, at night, in the cold");
  assert.equal(describeOccasion({ ...parseOccasion("dinner tomorrow"), place: "Boston" }), "dressy, in the evening, tomorrow, in Boston");
  assert.equal(describeOccasion({ ...parseOccasion("x"), temps: { high: 45, low: 38 } }), "everyday, 45° to 38°");
  assert.equal(describeOccasion({ ...parseOccasion("x"), temps: { high: 45, low: 45 } }), "everyday, 45°");
  assert.equal(describeOccasion(parseOccasion("the gym")), "the gym");
});
