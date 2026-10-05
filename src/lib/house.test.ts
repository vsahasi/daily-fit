import assert from "node:assert/strict";
import { test } from "node:test";
import { planDay } from "@/lib/bands";
import { houseScore } from "@/lib/house";
import { buildRecency } from "@/lib/rotation";
import { testItem } from "@/lib/testing";
import type { Weather } from "@/lib/types";

const warm: Weather = { date: "2026-10-01", tempMin: 60, tempMax: 76, precipProb: 0, code: 1, summary: "clear", locationLabel: "Berkeley" };
const mild: Weather = { ...warm, tempMax: 66, tempMin: 55 };
const polo = testItem({ id: "polo", category: "top", name: "Blue Goodfellow Short-Sleeve Polo" });
const perfPolo = testItem({ id: "haus", category: "top", name: "Navy HAUS Short-Sleeve Performance Polo", material: "performance polyester knit" });
const tee = testItem({ id: "tee", category: "top", name: "COS White Pocket Tee" });
const longTee = testItem({ id: "ls", category: "top", name: "Black Old Navy Long-Sleeve Tee" });
const chino = testItem({ id: "chino", category: "bottom", name: "Khaki Slim Chino" });

test("a polo starts behind a tee, and a performance polo is still a polo", () => {
  const plan = planDay(warm);
  assert.ok(houseScore(polo, plan).score < houseScore(tee, plan).score);
  assert.equal(houseScore(perfPolo, plan).score, houseScore(polo, plan).score);
});

test("a polo shown or worn this week is held back harder", () => {
  const plan = planDay(warm);
  const fresh = houseScore(polo, plan, buildRecency([], "2026-10-05", { items: [polo, tee, chino] })).score;
  const worn = houseScore(polo, plan, buildRecency([{ date: "2026-10-03", itemIds: ["polo", "chino"] }], "2026-10-05", { items: [polo, tee, chino] })).score;
  const shown = houseScore(polo, plan, buildRecency([], "2026-10-05", { shown: [{ date: "2026-10-04", itemIds: ["polo", "chino"] }], items: [polo, tee, chino] })).score;
  assert.ok(worn < fresh);
  assert.ok(shown < fresh);
  const lastWeek = houseScore(polo, plan, buildRecency([{ date: "2026-09-28", itemIds: ["polo", "chino"] }], "2026-10-05", { items: [polo, tee, chino] })).score;
  assert.equal(lastWeek, fresh, "a week later the polo is only behind by its base");
});

test("on a day that allows long sleeves, a long sleeve gets a nod", () => {
  assert.ok(houseScore(longTee, planDay(mild)).score > houseScore(tee, planDay(mild)).score);
  assert.equal(houseScore(longTee, planDay(warm)).score, 0, "not when the day forbids long sleeves anyway");
});
