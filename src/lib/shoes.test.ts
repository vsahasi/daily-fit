import assert from "node:assert/strict";
import { test } from "node:test";
import { comboKey } from "@/lib/combo";
import { parseOccasion } from "@/lib/occasion";
import { pickLook, rankLooks } from "@/lib/pair";
import { buildRecency } from "@/lib/rotation";
import { pieceKind } from "@/lib/kinds";
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
const hot: Weather = { ...mild, tempMin: 68, tempMax: 86, summary: "hot" };
const cold: Weather = { ...mild, tempMin: 40, tempMax: 50, summary: "cold" };
const wet: Weather = { ...mild, precipProb: 80, summary: "rain" };

const whiteTee = testItem({ id: "white-tee", category: "top", name: "White tee", colorFamilies: '["white"]' });
const greyTee = testItem({ id: "grey-tee", category: "top", name: "Grey tee", colorFamilies: '["grey"]' });
const oxford = testItem({
  id: "oxford",
  category: "top",
  name: "White oxford shirt",
  colorFamilies: '["white"]',
  formality: 4,
});
const oliveCargo = testItem({
  id: "olive-cargo",
  category: "bottom",
  name: "Olive cargo pant",
  colorFamilies: '["olive"]',
});
const navyChino = testItem({
  id: "navy-chino",
  category: "bottom",
  name: "Navy chino",
  subcategory: "chino",
  formality: 3,
});
const sandShort = testItem({
  id: "sand-short",
  category: "bottom",
  name: "Sand linen short",
  subcategory: "short",
  colorFamilies: '["sand"]',
  warmth: 1,
});

const sneaker = testItem({
  id: "cream-sneaker",
  category: "shoes",
  name: "Cream knit sneaker",
  subcategory: "sneaker",
  colorFamilies: '["cream"]',
  rainOk: false,
});
const runner = testItem({
  id: "black-runner",
  category: "shoes",
  name: "Black runner",
  subcategory: "runner",
  colorFamilies: '["black"]',
  formality: 1,
});
const flipFlop = testItem({
  id: "tan-flip-flop",
  category: "shoes",
  name: "Tan flip-flop",
  subcategory: "flip-flop",
  colorFamilies: '["sand"]',
  formality: 1,
  warmth: 1,
  rainOk: false,
});
const allShoes = [sneaker, runner, flipFlop];

type Closet = ReturnType<typeof testItem>[];

function pick(items: Closet, weather: Weather, occasion?: string) {
  return pickLook({
    items,
    weather,
    skippedCombos: [],
    occasion: occasion ? parseOccasion(occasion) : undefined,
    dateKey: "2026-09-17:test",
  });
}

function shoesIn(look: { itemIds: string[] }, closet: Closet) {
  return look.itemIds
    .map((id) => closet.find((item) => item.id === id))
    .filter((item) => item?.category === "shoes")
    .map((item) => item?.id);
}

test("a look carries exactly one pair when the closet has shoes", () => {
  const closet = [whiteTee, oliveCargo, ...allShoes];
  assert.equal(shoesIn(pick(closet, mild), closet).length, 1);
});

test("the shoes come last, after the clothes", () => {
  const closet = [sneaker, whiteTee, oliveCargo];
  assert.deepEqual(pick(closet, mild).itemIds, ["white-tee", "olive-cargo", "cream-sneaker"]);
});

test("a closet with no shoes still gets dressed", () => {
  assert.deepEqual(pick([whiteTee, oliveCargo], mild).itemIds, ["white-tee", "olive-cargo"]);
});

test("shoes in the wash are not worn", () => {
  const closet = [whiteTee, oliveCargo, { ...sneaker, status: "wash" }, runner];
  assert.deepEqual(shoesIn(pick(closet, mild), closet), ["black-runner"]);
});

test("every look in the deck carries a pair", () => {
  const closet = [whiteTee, greyTee, oliveCargo, navyChino, ...allShoes];
  const looks = rankLooks({ items: closet, weather: mild, skippedCombos: [], dateKey: "2026-09-17:everyday" });
  assert.ok(looks.length >= 2);
  for (const look of looks) assert.equal(shoesIn(look, closet).length, 1);
});

test("the deck shows each stack of clothes once, not once per pair", () => {
  const closet = [whiteTee, oliveCargo, ...allShoes];
  const looks = rankLooks({ items: closet, weather: mild, skippedCombos: [], dateKey: "2026-09-17:everyday" });
  assert.equal(looks.length, 1);
});

test("an everyday day gets the sneaker, not flip-flops", () => {
  const closet = [whiteTee, oliveCargo, ...allShoes];
  assert.deepEqual(shoesIn(pick(closet, mild), closet), ["cream-sneaker"]);
});

test("the beach gets flip-flops", () => {
  const closet = [whiteTee, sandShort, ...allShoes];
  assert.deepEqual(shoesIn(pick(closet, hot, "beach"), closet), ["tan-flip-flop"]);
});

test("the gym gets runners", () => {
  const closet = [whiteTee, sandShort, ...allShoes];
  assert.deepEqual(shoesIn(pick(closet, mild, "gym"), closet), ["black-runner"]);
});

test("rain leaves the knit sneaker home for a pair that can get wet", () => {
  const closet = [whiteTee, oliveCargo, ...allShoes];
  assert.deepEqual(shoesIn(pick(closet, wet), closet), ["black-runner"]);
});

test("a cold day never gets flip-flops over closed shoes", () => {
  const closet = [whiteTee, oliveCargo, flipFlop, runner];
  assert.deepEqual(shoesIn(pick(closet, cold), closet), ["black-runner"]);
});

test("dinner gets the cleanest pair in the closet, not runners or flip-flops", () => {
  const closet = [oxford, navyChino, ...allShoes];
  assert.deepEqual(shoesIn(pick(closet, mild, "dinner"), closet), ["cream-sneaker"]);
});

test("the only pair is still worn when it is the wrong pair", () => {
  const closet = [whiteTee, oliveCargo, flipFlop];
  assert.deepEqual(shoesIn(pick(closet, cold), closet), ["tan-flip-flop"]);
});

test("skipping a look does not bring the same clothes back in other shoes", () => {
  const closet = [whiteTee, greyTee, oliveCargo, ...allShoes];
  const first = pick(closet, mild);
  const next = pickLook({
    items: closet,
    weather: mild,
    skippedCombos: [comboKey(first.itemIds)],
    dateKey: "2026-09-17:test",
  });
  const clothes = (look: { itemIds: string[] }) => look.itemIds.filter((id) => !shoesIn(look, closet).includes(id));
  assert.notDeepEqual(clothes(next), clothes(first));
});

test("a look skipped before there were shoes stays skipped", () => {
  const closet = [whiteTee, greyTee, oliveCargo, sneaker];
  const next = pickLook({
    items: closet,
    weather: mild,
    skippedCombos: [comboKey(["white-tee", "olive-cargo"])],
    dateKey: "2026-09-17:test",
  });
  assert.ok(next.itemIds.includes("grey-tee"));
});

test("a stack worn yesterday sits out even when today's shoes differ", () => {
  // Two identical pairs, so a change of shoes is the only way to dodge the repeat.
  const spare = { ...sneaker, id: "spare-sneaker" };
  const closet = [whiteTee, oliveCargo, sneaker, spare];
  const opts = { items: closet, weather: mild, skippedCombos: [], dateKey: "2026-09-17:test" };
  const fresh = pickLook(opts);
  assert.ok(fresh.itemIds.includes("cream-sneaker"));
  const worn = [{ date: "2026-09-16", itemIds: ["white-tee", "olive-cargo", "spare-sneaker"] }];
  const repeat = pickLook({ ...opts, recency: buildRecency(worn, "2026-09-17") });
  assert.ok(fresh.score - repeat.score >= 45, `only ${fresh.score - repeat.score} held back`);
});

test("a stack turned down yesterday stays away even when today's shoes differ", () => {
  const closet = [whiteTee, greyTee, oliveCargo, navyChino, ...allShoes];
  const first = pick(closet, mild);
  const clothes = first.itemIds.filter((id) => !allShoes.some((shoe) => shoe.id === id));
  const recency = buildRecency([], "2026-09-17", {
    turnedDown: [{ date: "2026-09-16", itemIds: [...clothes, "spare-sneaker"] }],
  });
  const next = pickLook({ items: closet, weather: mild, skippedCombos: [], dateKey: "2026-09-17:test", recency });
  const nextClothes = next.itemIds.filter((id) => !allShoes.some((shoe) => shoe.id === id));
  assert.notEqual(comboKey(nextClothes), comboKey(clothes), "the turned-down clothes came back in other shoes");
});

test("shoes are known by kind", () => {
  assert.equal(pieceKind(sneaker), "sneaker");
  assert.equal(pieceKind(runner), "runner");
  assert.equal(pieceKind(flipFlop), "sandal");
});

test("shoes follow the clothes: owning shoes never changes which clothes win", () => {
  const blackJogger = testItem({
    id: "black-jogger",
    category: "bottom",
    name: "Black fleece jogger",
    subcategory: "sweatpant",
    colorFamilies: '["black"]',
  });
  const clothes = [whiteTee, greyTee, oxford, oliveCargo, navyChino, sandShort, blackJogger];
  const days: { weather: Weather; occasion?: string }[] = [
    { weather: mild },
    { weather: mild, occasion: "gym" },
    { weather: hot, occasion: "beach" },
    { weather: cold },
  ];
  for (const day of days) {
    const rank = (items: Closet) =>
      rankLooks({
        items,
        weather: day.weather,
        skippedCombos: [],
        occasion: day.occasion ? parseOccasion(day.occasion) : undefined,
        dateKey: "2026-09-17:test",
      }).map((look) => look.itemIds.filter((id) => clothes.some((item) => item.id === id)));
    assert.deepEqual(rank([...clothes, ...allShoes]), rank(clothes), day.occasion ?? day.weather.summary);
  }
});

test("a runner its owner wears every day is a sneaker on the street and still a runner at the gym", () => {
  const street = testItem({ ...runner, id: "street-runner", profile: JSON.stringify({ wearAs: "sneaker" }) });
  const darkCargo = testItem({ id: "black-cargo", category: "bottom", name: "Black cargo pant", colorFamilies: '["black"]' });
  const blackTee = testItem({ id: "black-tee", category: "top", name: "Black tee", colorFamilies: '["black"]' });
  const everyday = pick([blackTee, darkCargo, sneaker, street], mild);
  assert.deepEqual(shoesIn(everyday, [blackTee, darkCargo, sneaker, street]), ["street-runner"], "dark shoe under dark trousers");
  const light = pick([whiteTee, sandShort, sneaker, street], hot);
  assert.deepEqual(shoesIn(light, [whiteTee, sandShort, sneaker, street]), ["cream-sneaker"], "light shoe under light shorts");
  const gym = pick([whiteTee, oliveCargo, sneaker, street], mild, "gym");
  assert.deepEqual(shoesIn(gym, [whiteTee, oliveCargo, sneaker, street]), ["street-runner"]);
});

test("a clog is not a sandal: it survives a cool day, and loses to a sneaker by default", () => {
  const clog = testItem({ id: "clog", category: "shoes", name: "Khaki Birkenstock Boston Vegan Clog", subcategory: "clog", colorFamilies: '["khaki"]', rainOk: false });
  assert.equal(pieceKind(clog), "clog");
  const cool: Weather = { ...mild, tempMin: 52, tempMax: 62 };
  const only = pick([whiteTee, oliveCargo, clog], cool);
  assert.ok(!/flip-flops|clog/i.test(only.blocked ?? ""), "clogs at 62 break no shoe rule");
  const both = pick([whiteTee, oliveCargo, clog, sneaker], mild);
  assert.deepEqual(shoesIn(both, [whiteTee, oliveCargo, clog, sneaker]), ["cream-sneaker"]);
});
