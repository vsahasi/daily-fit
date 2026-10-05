import assert from "node:assert/strict";
import { test } from "node:test";
import { hasCollar, layerRole, pairKind, pieceKind, sleeveLength } from "@/lib/kinds";
import { testItem } from "@/lib/testing";

const top = (name: string, over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category: "top", name, ...over });
const bottom = (name: string, over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category: "bottom", name, ...over });

test("a written sleeve length wins over the cut", () => {
  assert.equal(sleeveLength(top("Navy Textured Short-Sleeve Crewneck Sweater")), "short");
  assert.equal(sleeveLength(top("Faded Navy Short-Sleeve Henley")), "short");
  assert.equal(sleeveLength(top("Black Old Navy Long-Sleeve Tee")), "long");
  assert.equal(sleeveLength(top("Grey Nike Soccer Tee", { silhouette: "long-sleeve athletic tee" })), "long");
});

test("the cut names the sleeve when nothing is written", () => {
  assert.equal(sleeveLength(top("Charcoal Waffle Henley", { silhouette: "thermal henley" })), "long");
  assert.equal(sleeveLength(top("J.Crew Light Blue Oxford Button-Down Shirt")), "long");
  assert.equal(sleeveLength(top("Charcoal Heather Crewneck Sweatshirt")), "long");
  assert.equal(sleeveLength(top("COS White Pocket Tee")), "short");
  assert.equal(sleeveLength(top("Goodfellow Olive Polo")), "short");
  assert.equal(sleeveLength(top("Real Madrid Home Jersey")), "short");
  assert.equal(sleeveLength(top("Theory Light Blue Linen Shirt", { subcategory: "short-sleeve shirt" })), "short");
});

test("a warm top with no cut named is treated as long, and every outer layer is long", () => {
  assert.equal(sleeveLength(top("Olive Top", { warmth: 3 })), "long");
  assert.equal(sleeveLength(top("Olive Top", { warmth: 1 })), "short");
  assert.equal(sleeveLength(testItem({ id: "j", category: "outer", name: "Navy Zip Jacket" })), "long");
});

test("bottoms split into the kinds the pairing rules care about", () => {
  assert.equal(pieceKind(bottom("Black Puma Athletic Short")), "athletic short");
  assert.equal(pieceKind(bottom("Sand Straight Chino Short")), "short");
  assert.equal(pieceKind(bottom("Khaki Slim Chino")), "chino");
  assert.equal(pieceKind(bottom("Charcoal Cargo Work Pant")), "cargo pant");
  assert.equal(pieceKind(bottom("Olive Abercrombie Carpenter Pant")), "work pant");
  assert.equal(pieceKind(bottom("Black Fleece Jogger")), "sweatpant");
  assert.equal(pieceKind(bottom("Indigo Selvedge Jean")), "jean");
  assert.equal(pieceKind(bottom("Vuori Grey-Gold Dress Pant")), "dress pant");
  assert.equal(pieceKind(bottom("Natural Drawstring Linen Pant")), "linen pant");
  assert.equal(pieceKind(bottom("Dark Brown Wide-Wale Corduroy Pant")), "work pant");
});

test("tops split the same way, and the fabric is not the cut", () => {
  assert.equal(pieceKind(top("Black Nike Soccer Dri-Fit Tee")), "athletic tee");
  assert.equal(pieceKind(top("Grey Vuori Pocket Tee", { material: "heathered knit jersey" })), "tee");
  assert.equal(pieceKind(top("COS White Pocket Tee", { material: "cotton jersey" })), "tee");
  assert.equal(pieceKind(top("Cal Navy Nike Short-Sleeve Jersey")), "jersey");
  assert.equal(pieceKind(top("Charcoal Heather Crewneck Sweatshirt")), "sweatshirt");
  assert.equal(pieceKind(top("Charcoal Lululemon Textured Hoodie")), "hoodie");
  assert.equal(pieceKind(top("Olive Quarter-Zip Sweater")), "sweater");
  assert.equal(pieceKind(top("Sage Pinstripe Button-Up Shirt")), "shirt");
  assert.equal(pieceKind(top("Theory Light Blue Linen Short-Sleeve Shirt")), "shirt");
  assert.equal(pieceKind(testItem({ id: "sj", category: "outer", name: "Charcoal Windowpane Shirt Jacket" })), "jacket");
});

test("a short-sleeve sweater is worn as a top, a hoodie can be a mid, a jacket is a shell", () => {
  assert.equal(layerRole(top("Navy Textured Short-Sleeve Crewneck Sweater")), "base");
  assert.equal(layerRole(top("Charcoal Lululemon Textured Hoodie")), "mid");
  assert.equal(layerRole(top("Olive Quarter-Zip Sweater", { warmth: 4 })), "mid");
  assert.equal(layerRole(testItem({ id: "j", category: "outer", name: "Navy Zip Jacket" })), "shell");
  assert.equal(layerRole(testItem({ id: "h", category: "outer", name: "Rust Heather Hoodie" })), "mid");
});

test("a sweatshirt and a t-shirt have no collar; a polo, an oxford, and a collared bomber do", () => {
  assert.equal(hasCollar(top("Charcoal Heather Crewneck Sweatshirt")), false);
  assert.equal(hasCollar(top("Black COS T-Shirt")), false);
  assert.equal(hasCollar(top("Champion Navy Zip Hoodie", { material: "cotton-blend sweatshirt fleece" })), false);
  assert.equal(hasCollar(top("Blue Goodfellow Short-Sleeve Polo")), true);
  assert.equal(hasCollar(top("J.Crew Light Blue Oxford Button-Down Shirt")), true);
  assert.equal(hasCollar(testItem({ id: "b", category: "outer", name: "Seven Seven Navy Zip Jacket", silhouette: "collared bomber jacket" })), true);
  assert.equal(hasCollar(testItem({ id: "q", category: "outer", name: "Polo Ralph Lauren Grey Quarter-Zip" })), false);
});

test("pairKind is the shape of the look", () => {
  assert.equal(pairKind([top("Grey Vuori Pocket Tee"), bottom("Khaki Slim Chino")]), "tee + chino");
});
