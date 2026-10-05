import assert from "node:assert/strict";
import { test } from "node:test";
import { comboKey } from "@/lib/combo";
import { pickLook } from "@/lib/pair";
import { buildRecency } from "@/lib/rotation";
import { testItem } from "@/lib/testing";
import type { Weather } from "@/lib/types";

const mild: Weather = {
  date: "2026-09-17",
  tempMin: 58,
  tempMax: 70,
  precipProb: 0,
  code: 1,
  summary: "clear",
  locationLabel: "Berkeley",
};

const whiteTee = testItem({ id: "white-tee", category: "top", name: "White tee", colorFamilies: '["white"]' });
const greyTee = testItem({ id: "grey-tee", category: "top", name: "Grey tee", colorFamilies: '["grey"]' });
const blackTee = testItem({ id: "black-tee", category: "top", name: "Black tee", colorFamilies: '["black"]' });
const navyCargo = testItem({ id: "navy-cargo", category: "bottom", name: "Navy cargo pant" });
const oliveCargo = testItem({
  id: "olive-cargo",
  category: "bottom",
  name: "Olive cargo pant",
  colorFamilies: '["khaki"]',
});

function pick(items: ReturnType<typeof testItem>[], worn: { date: string; itemIds: string[] }[]) {
  return pickLook({
    items,
    weather: mild,
    skippedCombos: [],
    dateKey: "2026-09-17:everyday",
    recency: buildRecency(worn, "2026-09-17"),
  });
}

test("the look worn yesterday does not win again today", () => {
  const closet = [whiteTee, greyTee, blackTee, navyCargo, oliveCargo];
  const first = pick(closet, []);
  const next = pick(closet, [{ date: "2026-09-16", itemIds: first.itemIds }]);
  assert.notEqual(comboKey(next.itemIds), comboKey(first.itemIds));
});

test("the day after, the top rotates rather than repeating", () => {
  const closet = [whiteTee, greyTee, blackTee, navyCargo, oliveCargo];
  const first = pick(closet, []);
  const wornTop = first.itemIds.find((id) => id.endsWith("tee"));
  const next = pick(closet, [{ date: "2026-09-16", itemIds: first.itemIds }]);
  assert.ok(wornTop);
  assert.ok(!next.itemIds.includes(wornTop), "yesterday's tee should sit out a day");
});

test("over a week of confirmed wears no exact stack repeats", () => {
  const closet = [whiteTee, greyTee, blackTee, navyCargo, oliveCargo];
  const worn: { date: string; itemIds: string[] }[] = [];
  const days = ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"];
  for (const day of days) {
    const look = pickLook({
      items: closet,
      weather: mild,
      skippedCombos: [],
      dateKey: `${day}:everyday`,
      recency: buildRecency(worn, day),
    });
    worn.push({ date: day, itemIds: look.itemIds });
  }
  const keys = worn.map((row) => comboKey(row.itemIds));
  assert.equal(new Set(keys).size, keys.length, `stacks repeated: ${keys.join(" / ")}`);
});

test("a one-look closet still gets dressed the next day", () => {
  const closet = [whiteTee, navyCargo];
  const next = pick(closet, [{ date: "2026-09-16", itemIds: ["white-tee", "navy-cargo"] }]);
  assert.equal(comboKey(next.itemIds), comboKey(["white-tee", "navy-cargo"]));
});
