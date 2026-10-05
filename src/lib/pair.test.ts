import assert from "node:assert/strict";
import { test } from "node:test";
import { comboKey } from "@/lib/combo";
import { pairKind } from "@/lib/kinds";
import { buildLikes } from "@/lib/likes";
import { normalizeStack, pickLook, rankLooks, swapPiece } from "@/lib/pair";
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

const warm: Weather = { ...mild, tempMin: 59, tempMax: 76, summary: "clear" };
const longTee = testItem({ id: "long-tee", category: "top", name: "Black Old Navy Long-Sleeve Tee", colorFamilies: '["black"]' });
const jacket = testItem({ id: "jacket", category: "outer", name: "Navy Zip Jacket", warmth: 3, colorFamilies: '["navy"]' });

test("above 70 a long sleeve is never picked while a short sleeve is clean", () => {
  const closet = [longTee, whiteTee, navyCargo, oliveCargo];
  for (const day of ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]) {
    const look = pickLook({ items: closet, weather: warm, skippedCombos: [], dateKey: `${day}:everyday` });
    assert.ok(!look.itemIds.includes("long-tee"), `long sleeve went out on ${day}`);
    assert.equal(look.blocked, undefined);
  }
});

test("in the heat a light tee beats a knit of the same colors on the same trousers", () => {
  const knit = testItem({ id: "knit", category: "top", name: "White Short-Sleeve Knit Polo", colorFamilies: '["white"]', warmth: 3, formality: 3 });
  const tee = testItem({ id: "tee", category: "top", name: "White Pocket Tee", colorFamilies: '["white"]', warmth: 1, formality: 3 });
  const chino = testItem({ id: "chino", category: "bottom", name: "Navy Slim Chino", colorFamilies: '["navy"]', formality: 3 });
  const look = pickLook({ items: [knit, tee, chino], weather: warm, skippedCombos: [], dateKey: "2026-09-17:everyday" });
  assert.ok(look.itemIds.includes("tee"), `expected the tee, got ${look.itemIds.join(", ")}`);
});

test("above 70 with a long sleeve as the only clean top, it still goes out, and says why", () => {
  const look = pickLook({ items: [longTee, navyCargo], weather: warm, skippedCombos: [], dateKey: "2026-09-17:everyday" });
  assert.ok(look.blocked, "the look should be marked as breaking the rule");
  assert.match(look.reason, /nothing clean does better/);
});

test("above 70 a layer only goes out when the day drops drastically", () => {
  const closet = [whiteTee, greyTee, navyCargo, jacket];
  const steady = pickLook({ items: closet, weather: warm, skippedCombos: [], dateKey: "2026-09-17:everyday" });
  assert.ok(!steady.itemIds.includes("jacket"));
  const swing = pickLook({
    items: closet,
    weather: { ...warm, tempMin: 46 },
    skippedCombos: [],
    dateKey: "2026-09-17:everyday",
  });
  assert.equal(swing.blocked, undefined);
});

test("an everyday day does not go out in a gym kit while a real look is clean", () => {
  const jersey = testItem({ id: "jersey", category: "top", name: "Mexico Green Yellow Stripe Jersey", colorFamilies: '["green","yellow"]', formality: 1 });
  const perfShort = testItem({ id: "perf-short", category: "bottom", name: "Olive Performance Short", colorFamilies: '["olive"]', warmth: 1, formality: 2 });
  const chinoShort = testItem({ id: "chino-short", category: "bottom", name: "Sand Chino Short", colorFamilies: '["sand"]', warmth: 2 });
  const look = pickLook({ items: [jersey, greyTee, perfShort, chinoShort], weather: warm, skippedCombos: [], dateKey: "2026-09-17:everyday" });
  assert.ok(!look.itemIds.includes("jersey"), `got ${look.itemIds.join(", ")}`);
  assert.ok(!look.itemIds.includes("perf-short"), `got ${look.itemIds.join(", ")}`);
});

test("another look means another top and another bottom, while the closet allows", () => {
  const closet = [whiteTee, greyTee, blackTee, navyCargo, oliveCargo];
  const first = pick(closet, []);
  const next = pickLook({ items: closet, weather: mild, skippedCombos: [comboKey(first.itemIds)], avoidItems: first.itemIds, dateKey: "2026-09-17:everyday" });
  assert.ok(!next.itemIds.some((id) => first.itemIds.includes(id)), `shared a piece: ${next.itemIds.join(", ")}`);
  const tiny = [whiteTee, navyCargo, oliveCargo];
  const again = pickLook({ items: tiny, weather: mild, skippedCombos: [comboKey(["white-tee", "navy-cargo"])], avoidItems: ["white-tee", "navy-cargo"], dateKey: "2026-09-17:everyday" });
  assert.equal(comboKey(again.itemIds), comboKey(["white-tee", "olive-cargo"]), "the only other look still goes out");
});

test("swapping one piece keeps the rest and never hands back the same piece", () => {
  const closet = [whiteTee, greyTee, blackTee, navyCargo, oliveCargo];
  const first = pick(closet, []);
  const bottom = first.itemIds.find((id) => id.endsWith("cargo"))!;
  const top = first.itemIds.find((id) => id.endsWith("tee"))!;
  const swapped = swapPiece({ items: closet, weather: mild, dateKey: "2026-09-17:everyday", current: first.itemIds, itemId: top });
  assert.ok(swapped.itemIds.includes(bottom), "the bottom stays");
  assert.ok(!swapped.itemIds.includes(top), "the top changes");
  assert.equal(swapped.itemIds.length, first.itemIds.length);
  const newTop = swapped.itemIds.find((id) => id.endsWith("tee"))!;
  const again = swapPiece({ items: closet, weather: mild, dateKey: "2026-09-17:everyday", current: swapped.itemIds, itemId: newTop, avoidItems: [top] });
  assert.ok(![top, newTop].includes(again.itemIds.find((id) => id.endsWith("tee"))!), "a third tee, not one already tried");
  assert.throws(() => swapPiece({ items: [whiteTee, navyCargo], weather: mild, dateKey: "d", current: ["white-tee", "navy-cargo"], itemId: "white-tee" }));
});

test("a look turned down yesterday does not come back today", () => {
  const closet = [whiteTee, greyTee, blackTee, navyCargo, oliveCargo];
  const first = pick(closet, []);
  const next = pickLook({
    items: closet,
    weather: mild,
    skippedCombos: [],
    dateKey: "2026-09-17:everyday",
    recency: buildRecency([], "2026-09-17", { turnedDown: [{ date: "2026-09-16", itemIds: first.itemIds }] }),
  });
  assert.notEqual(comboKey(next.itemIds), comboKey(first.itemIds));
});

test("liking a look does not bring the same stack back the next day", () => {
  const closet = [whiteTee, greyTee, blackTee, navyCargo, oliveCargo];
  const first = pick(closet, []);
  const next = pickLook({
    items: closet,
    weather: mild,
    skippedCombos: [],
    dateKey: "2026-09-17:everyday",
    likes: buildLikes(closet, [first.itemIds, first.itemIds, first.itemIds]),
    recency: buildRecency([{ date: "2026-09-16", itemIds: first.itemIds }], "2026-09-17"),
  });
  assert.notEqual(comboKey(next.itemIds), comboKey(first.itemIds));
});

test("two weeks of dressing a mixed closet never repeats a stack and changes the shape of the day", () => {
  const closet = [
    whiteTee,
    greyTee,
    testItem({ id: "polo", category: "top", name: "Navy Short-Sleeve Polo", colorFamilies: '["navy"]', formality: 3 }),
    testItem({ id: "linen-shirt", category: "top", name: "Light Blue Linen Short-Sleeve Shirt", colorFamilies: '["blue","white"]', formality: 3 }),
    testItem({ id: "henley", category: "top", name: "Faded Navy Short-Sleeve Henley", colorFamilies: '["navy"]' }),
    navyCargo,
    oliveCargo,
    testItem({ id: "chino", category: "bottom", name: "Khaki Slim Chino", subcategory: "chino", colorFamilies: '["khaki"]', formality: 3 }),
    testItem({ id: "chino-short", category: "bottom", name: "Sand Chino Short", subcategory: "short", colorFamilies: '["sand"]', warmth: 1 }),
    testItem({ id: "linen-pant", category: "bottom", name: "Natural Linen Pant", subcategory: "linen pant", colorFamilies: '["cream"]', warmth: 2, formality: 3 }),
  ];
  const worn: { date: string; itemIds: string[] }[] = [];
  const kinds: string[] = [];
  for (let i = 1; i <= 14; i += 1) {
    const day = `2026-09-${String(i).padStart(2, "0")}`;
    const look = pickLook({
      items: closet,
      weather: warm,
      skippedCombos: [],
      dateKey: `${day}:everyday`,
      recency: buildRecency(worn, day, { items: closet }),
    });
    worn.push({ date: day, itemIds: look.itemIds });
    kinds.push(pairKind(look.itemIds.map((id) => closet.find((item) => item.id === id)!)));
  }
  const keys = worn.map((row) => comboKey(row.itemIds));
  assert.equal(new Set(keys).size, keys.length, `stacks repeated: ${keys.join(" / ")}`);
  for (let i = 2; i < kinds.length; i += 1) {
    assert.ok(
      !(kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2]),
      `the same shape of day three days running: ${kinds.join(", ")}`,
    );
  }
  assert.ok(new Set(kinds).size >= 4, `only ${new Set(kinds).size} shapes of day in two weeks: ${kinds.join(", ")}`);
});

test("a linen shirt can go out open over a tee in the heat, and an oxford open over a tee on a cool morning", () => {
  const linen = testItem({ id: "linen", category: "top", name: "Light Blue Linen Short-Sleeve Shirt", material: "linen", colorFamilies: '["blue"]', formality: 4 });
  const oxford = testItem({ id: "oxford", category: "top", name: "Light Blue Oxford Button-Down Shirt", colorFamilies: '["blue"]', formality: 4 });
  const shortBottom = testItem({ id: "short", category: "bottom", name: "Sand Chino Short", colorFamilies: '["sand"]', warmth: 1 });
  const hot: Weather = { ...mild, tempMin: 66, tempMax: 84, code: 0 };
  const hotLooks = rankLooks({ items: [whiteTee, linen, shortBottom], weather: hot, skippedCombos: [], dateKey: "2026-09-17:everyday", limit: 8 });
  assert.ok(hotLooks.some((look) => look.itemIds.includes("white-tee") && look.itemIds.includes("linen") && !look.blocked), "tee under an open linen shirt at 84");
  const foggy: Weather = { ...mild, tempMin: 50, tempMax: 67 };
  const coolLooks = rankLooks({ items: [whiteTee, oxford, navyCargo], weather: foggy, skippedCombos: [], dateKey: "2026-09-17:everyday", limit: 8 });
  assert.ok(coolLooks.some((look) => look.itemIds.includes("white-tee") && look.itemIds.includes("oxford") && !look.blocked), "tee under an open oxford on a 52 morning");
  const stack = normalizeStack([oxford, whiteTee, navyCargo]);
  assert.equal(stack.top?.id, "white-tee", "the tee is the base whatever the order");
});

test("the same closet and forecast do not open with the same look every day", () => {
  // Three tees that score alike: the date decides which one opens.
  const twins = ["a", "b", "c"].map((id) => testItem({ id: `white-tee-${id}`, category: "top", name: "White tee", colorFamilies: '["white"]' }));
  const closet = [...twins, navyCargo, oliveCargo];
  const firsts = new Set(
    Array.from({ length: 12 }, (_, i) => comboKey(pickLook({ items: closet, weather: mild, skippedCombos: [], dateKey: `2026-10-${10 + i}:everyday` }).itemIds)),
  );
  assert.ok(firsts.size >= 2, "the opening look should vary across dates");
});
