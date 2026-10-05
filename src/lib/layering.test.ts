import assert from "node:assert/strict";
import { test } from "node:test";
import { isOpenShirt, layerKind, pairValue, removableRank, stackVerdict } from "@/lib/layering";
import { testItem } from "@/lib/testing";

const it = (category: string, name: string, over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category, name, ...over });

const tee = it("top", "COS White Pocket Tee", { material: "cotton jersey", warmth: 1, colorFamilies: '["white"]' });
const oxford = it("top", "J.Crew Light Blue Oxford Button-Down Shirt", { material: "cotton oxford", warmth: 2, colorFamilies: '["blue","white"]' });
const polo = it("top", "Blue Goodfellow Short-Sleeve Polo", { material: "cotton piqué", warmth: 2, colorFamilies: '["navy"]' });
const jersey = it("top", "Mexico Green Yellow Stripe Jersey", { material: "performance polyester", warmth: 2, colorFamilies: '["green","yellow"]' });
const thermal = it("top", "Charcoal Waffle Henley", { silhouette: "long-sleeve thermal henley", material: "waffle-knit cotton jersey", warmth: 3, colorFamilies: '["grey"]' });
const hoodie = it("outer", "Charcoal Lululemon Textured Hoodie", { material: "textured knit fleece", warmth: 3, colorFamilies: '["grey"]' });
const zipHoodie = it("outer", "Champion Navy Zip Hoodie", { silhouette: "full-zip hoodie", material: "cotton-blend sweatshirt fleece", warmth: 3, colorFamilies: '["navy"]' });
const cottonQz = it("outer", "Polo Ralph Lauren Grey Quarter-Zip", { subcategory: "quarter-zip pullover", material: "cotton knit", warmth: 3, colorFamilies: '["grey"]' });
const perfQz = it("outer", "Black Quarter-Zip Pullover", { subcategory: "quarter-zip pullover", material: "smooth performance knit", warmth: 3, colorFamilies: '["black"]' });
const shirtJacket = it("outer", "Charcoal Windowpane Shirt Jacket", { material: "textured wool-blend fabric", warmth: 4, colorFamilies: '["grey","brown"]', pattern: "windowpane" });
const bomber = it("outer", "Seven Seven Navy Zip Jacket", { silhouette: "collared bomber jacket", material: "heavy knit blend", warmth: 3, colorFamilies: '["navy"]' });
const shell = it("outer", "Nike Harker Bocce Charcoal Jacket", { silhouette: "zip-front athletic jacket", material: "lightweight performance woven synthetic", warmth: 3, colorFamilies: '["grey","white"]' });
const chunky = it("top", "Olive Quarter-Zip Sweater", { subcategory: "quarter-zip sweater", material: "chunky cotton knit", warmth: 4, colorFamilies: '["olive"]' });
const sweatshirt = it("top", "Charcoal Heather Crewneck Sweatshirt", { material: "cotton-blend fleece", warmth: 3, colorFamilies: '["grey"]' });

test("layer kinds read the fabric, not only the cut", () => {
  assert.equal(layerKind(cottonQz), "quarter-zip");
  assert.equal(layerKind(perfQz), "perf quarter-zip");
  assert.equal(layerKind(shirtJacket), "shirt jacket");
  assert.equal(layerKind(bomber), "bomber");
  assert.equal(layerKind(shell), "zip shell");
  assert.equal(layerKind(chunky), "chunky sweater");
  assert.equal(layerKind(thermal), "thermal henley");
  assert.equal(layerKind(zipHoodie), "zip hoodie");
});

test("the forbidden stacks are out", () => {
  assert.equal(pairValue(polo, hoodie).value, null, "a polo under a pullover hoodie");
  assert.equal(pairValue(oxford, hoodie).value, null, "an oxford under a pullover hoodie");
  assert.equal(pairValue(jersey, shirtJacket).value, null, "a jersey under a wool shirt jacket");
  assert.equal(pairValue(jersey, cottonQz).value, null, "a jersey under a quarter-zip");
  assert.equal(pairValue(hoodie, cottonQz).value, null, "mid over mid");
  assert.equal(pairValue(shirtJacket, bomber).value, null, "shell over shell");
  assert.equal(pairValue(hoodie, zipHoodie).value, null, "two hoods");
});

test("the canonical stacks score well and the awkward ones cost", () => {
  assert.ok((pairValue(oxford, cottonQz).value ?? -99) >= 4, "oxford under a cotton quarter-zip");
  assert.ok((pairValue(oxford, perfQz).value ?? 99) < 0, "oxford under a performance quarter-zip is the midtown uniform");
  assert.ok((pairValue(tee, shirtJacket).value ?? -99) >= 4, "tee under a shirt jacket");
  assert.ok((pairValue(thermal, bomber).value ?? -99) >= 4, "thermal henley under a bomber");
  assert.ok((pairValue(sweatshirt, shirtJacket).value ?? -99) >= 4, "sweatshirt under a shirt jacket");
  assert.ok((pairValue(hoodie, shell).value ?? -99) >= 3, "a thin hoodie under the zip shell");
  assert.equal(pairValue(oxford, zipHoodie).value, null, "an oxford collar under a zip hoodie is out");
});

test("three layers must be base, mid, shell", () => {
  assert.equal(stackVerdict(tee, [hoodie, shell]).ok, true);
  assert.equal(stackVerdict(tee, [shell, hoodie]).ok, false, "a hoodie over a jacket");
  assert.equal(stackVerdict(tee, [chunky, shell]).ok, false, "a chunky sweater in three layers");
  assert.equal(stackVerdict(oxford, [cottonQz, bomber]).ok, true);
});

test("the carried layer is a zip shell first, a pullover last", () => {
  assert.equal(removableRank(shell, 74, true), 4);
  assert.equal(removableRank(shell, 74), 2);
  assert.equal(removableRank(bomber, 74), null);
  assert.equal(removableRank(shirtJacket, 74), 3);
  assert.equal(removableRank(zipHoodie, 74), 2);
  assert.equal(removableRank(hoodie, 74), null);
  assert.equal(removableRank(hoodie, 64), -2);
  assert.equal(removableRank(chunky, 60), null);
});

test("a full-zip fleece jacket is a mid that comes off, not a shell", () => {
  const fleece = it("outer", "Forest Green Patagonia Full-Zip Fleece Jacket", { subcategory: "fleece jacket", material: "sweater-knit fleece", warmth: 3, colorFamilies: '["green"]', rainOk: false });
  assert.equal(layerKind(fleece), "fleece jacket");
  assert.equal(removableRank(fleece, 74), 3);
  assert.ok((pairValue(tee, fleece).value ?? -99) >= 3);
  assert.equal(pairValue(hoodie, fleece).value, null, "a fleece over a hoodie is mid over mid");
  assert.equal(stackVerdict(tee, [fleece, shell]).ok, true, "tee, fleece, shell is a proper cold stack");
});

test("a shirt worn open goes over a tee and nothing else, and is the only layer", () => {
  const open = { ...oxford, category: "outer" };
  const linenOpen = { ...it("top", "Theory Light Blue Linen Short-Sleeve Shirt", { material: "linen", warmth: 2, colorFamilies: '["blue"]' }), category: "outer" };
  assert.equal(isOpenShirt(open), true);
  assert.equal(isOpenShirt(oxford), false, "worn as the top it is not a layer");
  assert.ok((pairValue(tee, open).value ?? -99) >= 3, "an oxford open over a tee");
  assert.ok((pairValue(tee, linenOpen).value ?? -99) >= 3, "a linen shirt open over a tee");
  assert.equal(pairValue(polo, open).value, null, "not over a polo");
  assert.equal(pairValue(thermal, open).value, null, "not over a thermal");
  assert.equal(stackVerdict(tee, [open]).ok, true);
  assert.equal(stackVerdict(tee, [open, shell]).ok, false, "not under a jacket as a third piece");
  assert.equal(removableRank(open, 76), 3);
});
