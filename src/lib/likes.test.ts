import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLikes, likeScore } from "@/lib/likes";
import { testItem } from "@/lib/testing";

const tee = testItem({ id: "tee", category: "top", name: "White tee" });
const tee2 = testItem({ id: "tee2", category: "top", name: "Grey tee" });
const polo = testItem({ id: "polo", category: "top", name: "Navy polo" });
const chino = testItem({ id: "chino", category: "bottom", name: "Khaki chino" });
const cargo = testItem({ id: "cargo", category: "bottom", name: "Navy cargo pant" });
const closet = [tee, tee2, polo, chino, cargo];

test("no likes, no bump", () => {
  assert.equal(likeScore([tee, chino], buildLikes(closet, [])).score, 0);
  assert.equal(likeScore([tee, chino]).score, 0);
});

test("a liked look nudges its kind of pairing and its pieces", () => {
  const likes = buildLikes(closet, [["tee", "chino"]]);
  const same = likeScore([tee, chino], likes);
  const sameKind = likeScore([tee2, chino], likes);
  const other = likeScore([polo, cargo], likes);
  assert.ok(same.score > sameKind.score);
  assert.ok(sameKind.score > 0, "a grey tee on the same chinos is the same kind of look");
  assert.equal(other.score, 0);
});

test("a look turned down is a nudge away from its kind and its pieces, capped like a like", () => {
  const likes = buildLikes(closet, [], [["polo", "chino"], ["polo", "chino"], ["polo", "cargo"]]);
  assert.ok(likeScore([polo, chino], likes).score < 0);
  assert.ok(likeScore([polo, chino], likes).score < likeScore([tee, chino], likes).score);
  assert.equal(likeScore([tee, cargo], likes).score, -1, "one pass on the cargo pant alone");
  const many = buildLikes(closet, [], Array.from({ length: 40 }, () => ["polo", "chino"]));
  assert.ok(likeScore([polo, chino], many).score >= -12);
});

test("a piece swapped out of a look is a small nudge away from that piece", () => {
  const likes = buildLikes(closet, [], [], ["polo"]);
  assert.equal(likeScore([polo, chino], likes).score, -1);
  assert.equal(likeScore([tee, chino], likes).score, 0);
});

test("the bump is capped however many likes pile up", () => {
  const likes = buildLikes(closet, Array.from({ length: 40 }, () => ["tee", "chino"]));
  assert.ok(likeScore([tee, chino], likes).score <= 12);
});
