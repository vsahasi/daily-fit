import assert from "node:assert/strict";
import { test } from "node:test";
import { classicScore } from "@/lib/classic";
import { testItem } from "@/lib/testing";

const top = (name: string, over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category: "top", name, ...over });
const bottom = (name: string, over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category: "bottom", name, ...over });
const outer = (name: string, over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category: "outer", name, ...over });

const whiteTee = top("White pocket tee", { colorFamilies: '["white"]', material: "cotton jersey" });
const oxford = top("Light blue oxford button-down shirt", { colorFamilies: '["blue","white"]' });
const polo = top("Navy polo", { colorFamilies: '["navy"]', material: "cotton piqué" });
const jersey = top("Real Madrid home jersey", { colorFamilies: '["white","navy"]' });
const hoodie = top("Charcoal hoodie", { colorFamilies: '["grey"]' });
const chino = bottom("Khaki slim chino", { colorFamilies: '["khaki"]', material: "cotton twill" });
const dressPant = bottom("Grey dress pant", { colorFamilies: '["grey"]' });
const jogger = bottom("Black fleece jogger", { colorFamilies: '["black"]' });
const athleticShort = bottom("Navy performance short", { colorFamilies: '["navy"]' });
const carpenter = bottom("Olive carpenter pant", { colorFamilies: '["olive"]', material: "cotton canvas" });

test("an oxford on chinos beats an oxford on joggers by a wide margin", () => {
  assert.ok(classicScore(oxford, chino).score - classicScore(oxford, jogger).score >= 25);
});

test("a polo wants chinos, not sweatpants", () => {
  assert.ok(classicScore(polo, chino).score > 10);
  assert.ok(classicScore(polo, jogger).score < 0);
});

test("a jersey lives on work pants, not athletic shorts or dress pants", () => {
  assert.ok(classicScore(jersey, carpenter).score > classicScore(jersey, athleticShort).score + 10);
  assert.ok(classicScore(jersey, carpenter).score > classicScore(jersey, dressPant).score + 10);
});

test("a hoodie on joggers is a fine off-duty pairing", () => {
  assert.ok(classicScore(hoodie, jogger).score > 0);
});

test("a white tee on khaki chinos names the classic", () => {
  const look = classicScore(whiteTee, chino);
  assert.ok(look.score >= 8);
  assert.ok(look.reasons.some((r) => /classic/i.test(r)));
});

test("a second pattern costs, a lone one on quiet pieces is a plus", () => {
  const stripeTee = top("Charcoal Adidas trefoil stripe tee", { colorFamilies: '["black"]', pattern: "stripe" });
  const windowpane = outer("Charcoal windowpane shirt jacket", { colorFamilies: '["grey"]', pattern: "windowpane" });
  const plainJacket = outer("Navy zip jacket", { colorFamilies: '["navy"]' });
  assert.ok(classicScore(stripeTee, carpenter, windowpane).score < classicScore(stripeTee, carpenter, plainJacket).score - 5);
  assert.ok(classicScore(stripeTee, carpenter).reasons.some((r) => /one pattern/i.test(r)));
});

test("shorts under a jacket contradict each other", () => {
  const short = bottom("Sand chino short", { colorFamilies: '["sand"]' });
  const bomber = outer("Navy zip jacket", { silhouette: "collared bomber jacket", material: "heavy knit blend", warmth: 3, colorFamilies: '["navy"]' });
  assert.ok(classicScore(whiteTee, short, bomber).score <= classicScore(whiteTee, short).score - 6);
});

test("a waffle henley on canvas work pants is a workwear texture pair", () => {
  const waffle = top("Charcoal waffle henley", { colorFamilies: '["grey"]', material: "waffle-knit cotton" });
  assert.ok(classicScore(waffle, carpenter).score > classicScore(waffle, dressPant).score + 8);
});
