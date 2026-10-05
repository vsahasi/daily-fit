import assert from "node:assert/strict";
import { test } from "node:test";
import { closetGaps } from "@/lib/gaps";
import { testItem } from "@/lib/testing";

const tee = testItem({ id: "tee", category: "top", name: "White pocket tee", warmth: 1 });
const chino = testItem({ id: "chino", category: "bottom", name: "Khaki slim chino", colorFamilies: '["khaki"]' });
const sneaker = testItem({ id: "sneaker", category: "shoes", name: "Cream knit sneaker", subcategory: "sneaker", rainOk: false });

test("a closet of tees, khakis, and one knit sneaker is missing the obvious things", () => {
  const keys = closetGaps([tee, chino, sneaker]).map((gap) => gap.key);
  assert.ok(keys.includes("rain shell"));
  assert.ok(keys.includes("dark pant"));
  assert.ok(keys.includes("second sneaker"));
  assert.equal(keys[0], "rain shell", "the rain shell comes first");
});

test("gaps close when the closet has the piece", () => {
  const jeans = testItem({ id: "jeans", category: "bottom", name: "Navy cargo work pant", colorFamilies: '["navy"]' });
  const shell = testItem({ id: "shell", category: "outer", name: "Navy waxed jacket", rainOk: true, warmth: 3, formality: 3 });
  const keys = closetGaps([tee, chino, sneaker, jeans, shell]).map((gap) => gap.key);
  assert.ok(!keys.includes("jeans"), "denim is never suggested");
  assert.ok(!keys.includes("rain shell"));
  assert.ok(!keys.includes("dark pant"), "a navy cargo work pant counts as the dark trouser");
  assert.ok(!keys.includes("light shell"));
});

test("a runner worn as an everyday sneaker counts as a second sneaker", () => {
  const runner = testItem({ id: "az", category: "shoes", name: "Black Adizero Runner", subcategory: "runner", profile: JSON.stringify({ wearAs: "sneaker" }) });
  assert.ok(!closetGaps([tee, chino, sneaker, runner]).map((gap) => gap.key).includes("second sneaker"));
  const plain = testItem({ id: "az2", category: "shoes", name: "Black Adizero Runner", subcategory: "runner" });
  assert.ok(closetGaps([tee, chino, sneaker, plain]).map((gap) => gap.key).includes("second sneaker"));
});
