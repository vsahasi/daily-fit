import assert from "node:assert/strict";
import { test } from "node:test";
import { coherenceScore, register } from "@/lib/register";
import { testItem } from "@/lib/testing";

const it = (category: string, name: string, over: Partial<Parameters<typeof testItem>[0]> = {}) =>
  testItem({ id: name, category, name, ...over });

test("register places the closet on a 1 to 4 scale", () => {
  assert.equal(register(it("top", "Mexico Green Yellow Stripe Jersey")), 1);
  assert.equal(register(it("top", "Black Nike Harker Soccer Dri-Fit Tee", { material: "Nike Dri-Fit" })), 1);
  assert.equal(register(it("top", "Navy HAUS Short-Sleeve Performance Polo", { material: "performance polyester knit" })), 1.5);
  assert.equal(register(it("top", "Charcoal Adidas Trefoil Stripe Tee")), 2);
  assert.equal(register(it("top", "COS White Pocket Tee", { material: "cotton jersey" })), 3);
  assert.equal(register(it("top", "Blue Goodfellow Short-Sleeve Polo", { material: "cotton piqué" })), 4);
  assert.equal(register(it("top", "J.Crew Light Blue Oxford Button-Down Shirt")), 4);
  assert.equal(register(it("outer", "Nike Harker Bocce Charcoal Jacket", { material: "performance woven synthetic" })), 1.5);
  assert.equal(register(it("outer", "Charcoal Windowpane Shirt Jacket", { material: "wool-blend" })), 4);
  assert.equal(register(it("outer", "Seven Seven Navy Zip Jacket", { silhouette: "collared bomber jacket", material: "heavy knit blend" })), 3);
  assert.equal(register(it("bottom", "Black Puma Athletic Short")), 1);
  assert.equal(register(it("bottom", "Black Fleece Jogger")), 1.5);
  assert.equal(register(it("bottom", "Olive Abercrombie Carpenter Pant")), 3);
  assert.equal(register(it("bottom", "Khaki Slim Chino")), 4);
  assert.equal(register(it("shoes", "Black Adidas Adizero Runner", { subcategory: "runner" })), 1);
  assert.equal(register(it("shoes", "Cream Adidas Ultraboost Sneaker", { subcategory: "sneaker", material: "Primeknit" })), 2);
});

test("a gap of three registers costs far more than a gap of one", () => {
  const tee = it("top", "COS White Pocket Tee");
  const pant = it("bottom", "Olive Carpenter Pant");
  const sneaker = it("shoes", "Cream Sneaker", { subcategory: "sneaker" });
  const jersey = it("top", "Real Madrid Home Jersey");
  const chino = it("bottom", "Khaki Slim Chino");
  assert.equal(coherenceScore([tee, pant, sneaker]).score, 4);
  assert.ok(coherenceScore([jersey, chino, sneaker]).score <= -12);
});

test("two athletic pieces cost, unless they are a kit at the gym", () => {
  const dri = it("top", "Green Nike Dri-Fit Tee", { material: "Nike Dri-Fit" });
  const perfShort = it("bottom", "Olive Performance Short");
  const sneaker = it("shoes", "Cream Sneaker", { subcategory: "sneaker" });
  assert.ok(coherenceScore([dri, perfShort, sneaker]).score < 0);
  assert.ok(coherenceScore([dri, perfShort, sneaker], { gym: true }).score >= 0);
});

test("a runner under a smart piece is held back", () => {
  const polo = it("top", "Blue Goodfellow Short-Sleeve Polo", { material: "cotton piqué" });
  const chino = it("bottom", "Khaki Slim Chino");
  const runner = it("shoes", "Black Adizero Runner", { subcategory: "runner" });
  const sneaker = it("shoes", "Cream Sneaker", { subcategory: "sneaker" });
  assert.ok(coherenceScore([polo, chino, runner]).score < coherenceScore([polo, chino, sneaker]).score);
});
