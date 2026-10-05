import assert from "node:assert/strict";
import { test } from "node:test";
import { formPrompt } from "@/lib/mannequin";

const tee = { name: "White tee", category: "top" };
const cargo = { name: "Olive cargo pant", category: "bottom" };
const sneaker = { name: "Cream knit sneaker", category: "shoes" };

test("a look with shoes puts that exact pair on the form's feet", () => {
  const prompt = formPrompt([tee, cargo, sneaker]);
  assert.match(prompt, /on its feet[^.]*Cream knit sneaker/);
  assert.doesNotMatch(prompt, /shoes optional/);
});

test("a look with no shoes keeps the feet plain", () => {
  const prompt = formPrompt([tee, cargo]);
  assert.match(prompt, /shoes optional and plain/);
});

test("every piece in the look is named", () => {
  const prompt = formPrompt([tee, cargo, sneaker]);
  for (const piece of [tee, cargo, sneaker]) assert.ok(prompt.includes(piece.name));
});
