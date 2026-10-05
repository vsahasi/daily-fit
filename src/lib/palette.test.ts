import assert from "node:assert/strict";
import { test } from "node:test";
import { paletteScore, shoePaletteScore } from "@/lib/palette";
import { testItem } from "@/lib/testing";

const it = (category: string, name: string, colors: string[], over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category, name, colorFamilies: JSON.stringify(colors), ...over });

test("neutrals plus one accent beat two accents", () => {
  const white = it("top", "White tee", ["white"]);
  const rust = it("top", "Rust hoodie", ["burgundy"]);
  const mustard = it("bottom", "Mustard work pant", ["gold"]);
  const olive = it("bottom", "Olive carpenter pant", ["olive"]);
  const pink = it("top", "Mauve polo", ["pink"]);
  assert.ok(paletteScore([white, olive]).score > 0);
  assert.ok(paletteScore([rust, olive]).score >= paletteScore([pink, mustard]).score + 5, "rust on olive is one earth family; mauve on mustard is two accents");
});

test("light against dark earns contrast, navy on black is held back", () => {
  const cream = it("top", "Cream henley", ["cream"]);
  const navyCargo = it("bottom", "Navy cargo pant", ["navy"]);
  const navyTee = it("top", "Navy tee", ["navy"]);
  const blackPant = it("bottom", "Black work pant", ["black"]);
  assert.ok(paletteScore([cream, navyCargo]).score >= 12, `cream on navy: ${paletteScore([cream, navyCargo]).score}`);
  assert.ok(paletteScore([navyTee, blackPant]).score < 0, `navy on black: ${paletteScore([navyTee, blackPant]).score}`);
});

test("the sandwich: shoes echo the top, and match the value of the trousers", () => {
  const cream = it("top", "Cream henley", ["cream"]);
  const navyCargo = it("bottom", "Navy cargo pant", ["navy"]);
  const sand = it("bottom", "Sand chino short", ["sand"]);
  const creamShoe = it("shoes", "Cream sneaker", ["cream"], { subcategory: "sneaker" });
  const blackShoe = it("shoes", "Black runner", ["black"], { subcategory: "runner" });
  // Under navy trousers a cream shoe that echoes the top and a black shoe that matches the leg are both right.
  assert.ok(shoePaletteScore(creamShoe, [cream, navyCargo]) >= shoePaletteScore(blackShoe, [cream, navyCargo]));
  assert.ok(shoePaletteScore(blackShoe, [cream, navyCargo]) > shoePaletteScore(blackShoe, [cream, sand]) + 5);
  assert.ok(shoePaletteScore(blackShoe, [cream, sand]) < 0, "a dark shoe under a light top and light shorts");
});
