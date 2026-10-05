import assert from "node:assert/strict";
import { test } from "node:test";
import { climateVerdict, dropsDrastically } from "@/lib/climate";
import { everydayOccasion, parseOccasion } from "@/lib/occasion";
import { testItem } from "@/lib/testing";
import type { Weather } from "@/lib/types";

const base: Weather = { date: "2026-09-24", tempMin: 59, tempMax: 76, precipProb: 0, code: 1, summary: "clear", locationLabel: "Berkeley" };
const everyday = everydayOccasion();

const longTee = testItem({ id: "ls", category: "top", name: "Black Old Navy Long-Sleeve Tee" });
const tee = testItem({ id: "tee", category: "top", name: "COS White Pocket Tee", warmth: 1 });
const hoodieTop = testItem({ id: "hoodie", category: "top", name: "Charcoal Lululemon Textured Hoodie", warmth: 3 });
const thermal = testItem({ id: "thermal", category: "top", name: "Charcoal Waffle Henley", silhouette: "long-sleeve thermal henley", warmth: 3 });
const cargo = testItem({ id: "cargo", category: "bottom", name: "Charcoal Cargo Work Pant", warmth: 3 });
const jogger = testItem({ id: "jogger", category: "bottom", name: "Black Fleece Jogger", warmth: 3 });
const short = testItem({ id: "short", category: "bottom", name: "Sand Chino Short", warmth: 1 });
const jacket = testItem({ id: "jacket", category: "outer", name: "Nike Bocce Charcoal Zip Jacket", silhouette: "zip-front athletic jacket", material: "lightweight woven synthetic", warmth: 3, rainOk: true });
const pullover = testItem({ id: "pullover", category: "outer", name: "Rust Heather Hoodie", silhouette: "pullover hoodie", warmth: 3, rainOk: false });
const knitHoodie = testItem({ id: "kh", category: "outer", name: "Brown Knit Hoodie", warmth: 3, rainOk: false });

test("above 70 a long sleeve is out, whatever else is true", () => {
  assert.equal(climateVerdict([longTee, cargo], base, everyday).ok, false);
  assert.equal(climateVerdict([longTee, cargo], { ...base, tempMax: 71 }, everyday).ok, false);
  assert.equal(climateVerdict([tee, cargo], base, everyday).ok, true);
  assert.equal(climateVerdict([longTee, cargo], { ...base, tempMax: 70 }, everyday).ok, true);
});

test("above 70 a layer only goes out when the day drops drastically, and then only a removable one over a short sleeve", () => {
  assert.equal(dropsDrastically(base), false);
  assert.equal(climateVerdict([tee, cargo, jacket], base, everyday).ok, false);
  const swing = { ...base, tempMin: 46 };
  assert.equal(dropsDrastically(swing), true);
  assert.equal(climateVerdict([tee, cargo, jacket], swing, everyday).ok, true, "a zip shell over a tee comes off at ten");
  assert.equal(climateVerdict([tee, cargo, pullover], swing, everyday).ok, false, "a pullover hoodie does not come off cleanly");
  assert.equal(climateVerdict([longTee, cargo, jacket], swing, everyday).ok, false, "the base is still short-sleeved");
});

test("above 70 sweatpants and heavy pieces are out", () => {
  assert.equal(climateVerdict([tee, jogger], base, everyday).ok, false);
  const heavy = testItem({ id: "h", category: "top", name: "Chunky Short-Sleeve Knit", warmth: 4 });
  assert.equal(climateVerdict([heavy, cargo], base, everyday).ok, false);
});

test("from 65 a hoodie as the top is out; from 58 it is fine and counts as the warm piece", () => {
  assert.equal(climateVerdict([hoodieTop, cargo], { ...base, tempMax: 67 }, everyday).ok, false);
  assert.equal(climateVerdict([hoodieTop, cargo], { ...base, tempMax: 60, tempMin: 52 }, everyday).ok, true);
  assert.equal(climateVerdict([longTee, cargo], { ...base, tempMax: 67 }, everyday).ok, true);
});

test("on a cool day something has to be warm: a light long sleeve alone is not enough", () => {
  const cool = { ...base, tempMin: 52, tempMax: 61 };
  assert.equal(climateVerdict([longTee, cargo], cool, everyday).ok, false);
  assert.equal(climateVerdict([longTee, cargo, jacket], cool, everyday).ok, true);
  assert.equal(climateVerdict([thermal, cargo], cool, everyday).ok, true);
});

test("on a cold day a short sleeve needs a mid layer, and a cold morning needs a jacket over it", () => {
  const cold = { ...base, tempMin: 44, tempMax: 54 };
  assert.equal(climateVerdict([tee, cargo, jacket], cold, everyday).ok, false, "a tee under only a shell");
  assert.equal(climateVerdict([tee, cargo, pullover, jacket], cold, everyday).ok, true, "tee, hoodie, jacket");
  assert.equal(climateVerdict([thermal, cargo, jacket], cold, everyday).ok, true, "a thermal under a jacket");
  assert.equal(climateVerdict([thermal, cargo], cold, everyday).ok, false, "a 46 morning wants the jacket");
  const milder = { ...base, tempMin: 50, tempMax: 56 };
  assert.equal(climateVerdict([thermal, cargo], milder, everyday).ok, true);
});

test("below 50 it takes three pieces", () => {
  const freezing = { ...base, tempMin: 38, tempMax: 46 };
  assert.equal(climateVerdict([tee, cargo], freezing, everyday).ok, false);
  assert.equal(climateVerdict([tee, cargo, jacket], freezing, everyday).ok, false);
  assert.equal(climateVerdict([tee, cargo, pullover, jacket], freezing, everyday).ok, true);
  assert.equal(climateVerdict([hoodieTop, cargo, jacket], freezing, everyday).ok, false, "below 50 the hoodie goes over a base, not on its own");
  const chilly = { ...base, tempMin: 44, tempMax: 54, precipProb: 70, code: 61 };
  assert.equal(climateVerdict([hoodieTop, cargo, jacket], chilly, everyday).ok, true, "a rainy 54 lets a hoodie under the shell stand in");
});

test("shorts follow the floor: never under 58, chino shorts never under 65, always at the gym or on the beach", () => {
  const cold = { ...base, tempMin: 42, tempMax: 52 };
  assert.equal(climateVerdict([tee, short, pullover], cold, everyday).ok, false);
  assert.equal(climateVerdict([tee, short], cold, parseOccasion("gym")).ok, true);
  assert.equal(climateVerdict([tee, short], { ...cold, tempMax: 84 }, parseOccasion("beach")).ok, true);
  const mild = { ...base, tempMin: 58, tempMax: 68, code: 0 };
  assert.equal(climateVerdict([tee, short], mild, everyday).ok, false, "chino shorts at 68");
  const athletic = testItem({ id: "perf", category: "bottom", name: "Olive Performance Short", warmth: 1 });
  assert.equal(climateVerdict([tee, athletic], mild, everyday).ok, true, "athletic shorts on a sunny 68");
});

test("above 70 a warm knit is out even with short sleeves, from 80 any knit is out, and below 62 linen stays home", () => {
  const knit = testItem({ id: "knit", category: "top", name: "Navy Textured Short-Sleeve Crewneck Sweater", warmth: 3 });
  assert.equal(climateVerdict([knit, cargo], { ...base, tempMax: 70, tempMin: 58 }, everyday).ok, true);
  assert.equal(climateVerdict([knit, cargo], { ...base, tempMax: 72 }, everyday).ok, false);
  const lightKnit = testItem({ id: "lk", category: "top", name: "Navy Knit Polo", warmth: 2 });
  assert.equal(climateVerdict([lightKnit, cargo], { ...base, tempMax: 76 }, everyday).ok, true);
  assert.equal(climateVerdict([lightKnit, cargo], { ...base, tempMax: 84 }, everyday).ok, false);
  const linen = testItem({ id: "linen", category: "bottom", name: "Natural Drawstring Linen Pant", warmth: 2 });
  assert.equal(climateVerdict([tee, linen, jacket], { ...base, tempMin: 44, tempMax: 54 }, everyday).ok, false);
  assert.equal(climateVerdict([tee, linen], { ...base, tempMax: 68 }, everyday).ok, true);
});

test("in scorching heat long pants stay home while shorts are clean, and linen never goes under a warm layer", () => {
  const scorching = { ...base, tempMin: 64, tempMax: 88, code: 0 };
  assert.equal(climateVerdict([tee, cargo], scorching, everyday).ok, false);
  assert.equal(climateVerdict([tee, short], scorching, everyday).ok, true);
  const linenPant = testItem({ id: "lp", category: "bottom", name: "Natural Drawstring Linen Pant", warmth: 2 });
  assert.equal(climateVerdict([tee, linenPant], scorching, everyday).ok, true, "linen pants are the exception");
  const bomber = testItem({ id: "bomber", category: "outer", name: "Seven Seven Navy Zip Jacket", silhouette: "collared bomber jacket", material: "heavy knit blend", warmth: 3 });
  const foggy = { ...base, tempMin: 50, tempMax: 66 };
  assert.equal(climateVerdict([tee, linenPant, bomber], foggy, everyday).ok, false);
  assert.equal(climateVerdict([tee, cargo, bomber], foggy, everyday).ok, true);
  assert.equal(climateVerdict([tee, cargo, bomber], { ...base, tempMin: 46 }, everyday).ok, false, "a heavy knit bomber is not the carried layer on a day headed to 76");
});

test("likely rain wants a jacket that can take it, and leaves knit shoes and linen at home", () => {
  // An overcast, rainy 58 dresses like 53: a long sleeve under the jacket.
  const wet = { ...base, tempMin: 50, tempMax: 58, precipProb: 70, code: 61 };
  assert.equal(climateVerdict([thermal, cargo, knitHoodie], wet, everyday).ok, false);
  assert.equal(climateVerdict([thermal, cargo, jacket], wet, everyday).ok, true);
  const knitShoe = testItem({ id: "ub", category: "shoes", name: "Cream Knit Sneaker", subcategory: "sneaker", rainOk: false });
  assert.equal(climateVerdict([thermal, cargo, jacket, knitShoe], wet, everyday).ok, false);
});
