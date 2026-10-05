import assert from "node:assert/strict";
import { test } from "node:test";
import { comboKey } from "@/lib/combo";
import { buildRecency, parseDecisions, rotationScore, undecidedPieces } from "@/lib/rotation";

const tee = { id: "tee", category: "top" };
const otherTee = { id: "tee2", category: "top" };
const cargo = { id: "cargo", category: "bottom" };

test("comboKey is the same whatever order the pieces come in", () => {
  assert.equal(comboKey(["b", "a"]), comboKey(["a", "b"]));
});

test("buildRecency records days since each piece and each exact stack was worn", () => {
  const recency = buildRecency(
    [
      { date: "2026-09-16", itemIds: ["tee", "cargo"] },
      { date: "2026-09-14", itemIds: ["tee2", "cargo"] },
    ],
    "2026-09-17",
  );
  assert.equal(recency.combos[comboKey(["tee", "cargo"])], 1);
  assert.equal(recency.combos[comboKey(["tee2", "cargo"])], 3);
  assert.equal(recency.lastWorn.cargo, 1);
  assert.equal(recency.lastWorn.tee2, 3);
  assert.equal(recency.wears.cargo, 2);
  assert.equal(recency.wears.tee, 1);
});

test("buildRecency ignores looks worn after the target date and more than two weeks back", () => {
  const recency = buildRecency(
    [
      { date: "2026-09-18", itemIds: ["tee", "cargo"] },
      { date: "2026-08-01", itemIds: ["tee2", "cargo"] },
    ],
    "2026-09-17",
  );
  assert.deepEqual(recency.combos, {});
  assert.deepEqual(recency.lastWorn, {});
});

test("a stack with no wear history is not penalized", () => {
  assert.equal(rotationScore([tee, cargo], undefined).score, 0);
  assert.equal(rotationScore([tee, cargo], buildRecency([], "2026-09-17")).score, 0);
});

test("yesterday's exact stack loses far more than a fresh top on the same trousers", () => {
  const recency = buildRecency([{ date: "2026-09-16", itemIds: ["tee", "cargo"] }], "2026-09-17");
  const same = rotationScore([tee, cargo], recency).score;
  const freshTop = rotationScore([otherTee, cargo], recency).score;
  assert.ok(same <= -45, `exact stack should be heavily penalized, got ${same}`);
  assert.ok(freshTop < 0, "the repeated trousers still cost something");
  assert.ok(freshTop > -15, `a fresh top should keep the trousers viable, got ${freshTop}`);
});

test("a repeated top costs more than a repeated bottom", () => {
  const recency = buildRecency([{ date: "2026-09-16", itemIds: ["tee", "cargo"] }], "2026-09-17");
  const repeatTop = rotationScore([tee, { id: "chino", category: "bottom" }], recency).score;
  const repeatBottom = rotationScore([otherTee, cargo], recency).score;
  assert.ok(repeatTop < repeatBottom);
});

test("the penalty fades after a few days and the exact stack is free again after a week", () => {
  const worn = [{ date: "2026-09-10", itemIds: ["tee", "cargo"] }];
  assert.equal(rotationScore([tee, cargo], buildRecency(worn, "2026-09-17")).score, 0);
  const midweek = rotationScore([tee, cargo], buildRecency(worn, "2026-09-14")).score;
  assert.ok(midweek <= -45, "four days later the exact stack is still held back");
});

test("wearing the same trousers all week stacks up against them", () => {
  const once = buildRecency([{ date: "2026-09-16", itemIds: ["tee", "cargo"] }], "2026-09-17");
  const thrice = buildRecency(
    [
      { date: "2026-09-16", itemIds: ["tee", "cargo"] },
      { date: "2026-09-15", itemIds: ["tee2", "cargo"] },
      { date: "2026-09-14", itemIds: ["tee3", "cargo"] },
    ],
    "2026-09-17",
  );
  const fresh = { id: "tee9", category: "top" };
  assert.ok(rotationScore([fresh, cargo], thrice).score < rotationScore([fresh, cargo], once).score);
});

test("parseDecisions keeps only wash and keep, and survives bad JSON", () => {
  assert.deepEqual(parseDecisions('{"a":"wash","b":"keep","c":"burn"}'), { a: "wash", b: "keep" });
  assert.deepEqual(parseDecisions("not json"), {});
  assert.deepEqual(parseDecisions(null), {});
});

test("undecidedPieces lists worn pieces nobody made a call on, newest wear first", () => {
  const pieces = undecidedPieces(
    [
      { id: "o1", date: "2026-09-15", itemIds: ["tee2", "cargo"], decisions: {} },
      { id: "o2", date: "2026-09-16", itemIds: ["tee", "cargo"], decisions: { tee: "wash" } },
    ],
    { from: "2026-09-14", to: "2026-09-16" },
  );
  assert.deepEqual(pieces, [
    { outfitId: "o2", itemId: "cargo" },
    { outfitId: "o1", itemId: "tee2" },
  ]);
});

test("a call on the latest wear settles earlier wears of the same piece", () => {
  const pieces = undecidedPieces(
    [
      { id: "o1", date: "2026-09-15", itemIds: ["tee", "cargo"], decisions: {} },
      { id: "o2", date: "2026-09-16", itemIds: ["tee", "cargo"], decisions: { tee: "keep", cargo: "keep" } },
    ],
    { from: "2026-09-14", to: "2026-09-16" },
  );
  assert.deepEqual(pieces, []);
});

test("undecidedPieces leaves out looks outside the window", () => {
  const pieces = undecidedPieces(
    [
      { id: "old", date: "2026-09-10", itemIds: ["tee"], decisions: {} },
      { id: "today", date: "2026-09-17", itemIds: ["cargo"], decisions: {} },
    ],
    { from: "2026-09-14", to: "2026-09-16" },
  );
  assert.deepEqual(pieces, []);
});
