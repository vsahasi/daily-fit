import assert from "node:assert/strict";
import { test } from "node:test";
import type { LookVote } from "@prisma/client";
import { buildTaste } from "@/lib/taste";
import { testItem } from "@/lib/testing";

const tee = testItem({ id: "tee", category: "top", name: "White tee" });
const polo = testItem({ id: "polo", category: "top", name: "Navy polo" });
const cargo = testItem({ id: "cargo", category: "bottom", name: "Navy cargo pant" });
const chino = testItem({ id: "chino", category: "bottom", name: "Khaki chino" });
const closet = [tee, polo, cargo, chino];

function vote(ids: string[], verdict: "like" | "pass", n: number): LookVote {
  return {
    id: `v${n}`,
    userId: "u1",
    comboKey: `${ids.join("|")}#${n}`,
    itemIds: JSON.stringify(ids),
    verdict,
    scenario: "everyday",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

test("with no wear history taste is unchanged from votes alone", () => {
  const votes = [vote(["tee", "cargo"], "like", 1), vote(["polo", "chino"], "pass", 2)];
  assert.deepEqual(buildTaste(closet, votes), buildTaste(closet, votes, []));
});

test("a worn look counts as a like, and counts for more than one swipe", () => {
  const votes = [
    vote(["polo", "chino"], "like", 1),
    vote(["polo", "chino"], "like", 2),
    vote(["polo", "chino"], "like", 3),
    vote(["tee", "cargo"], "pass", 4),
    vote(["tee", "cargo"], "pass", 5),
    vote(["tee", "cargo"], "pass", 6),
  ];
  const swipesOnly = buildTaste(closet, votes);
  const withWear = buildTaste(closet, votes, [
    { itemIds: ["tee", "cargo"], verdict: "worn" },
    { itemIds: ["tee", "cargo"], verdict: "worn" },
    { itemIds: ["tee", "cargo"], verdict: "worn" },
  ]);
  assert.equal(swipesOnly.pairRate["tee + cargo pant"] ?? 0, 0);
  // 3 passes against 3 wears at double weight: 6 / 9.
  assert.ok(Math.abs(withWear.pairRate["tee + cargo pant"] - 6 / 9) < 1e-9);
  assert.equal(withWear.worn, 3);
});

test("a skipped suggestion is a weak pass", () => {
  const votes = [
    vote(["tee", "cargo"], "like", 1),
    vote(["tee", "cargo"], "like", 2),
    vote(["tee", "cargo"], "like", 3),
    vote(["tee", "cargo"], "like", 4),
    vote(["tee", "cargo"], "like", 5),
    vote(["tee", "cargo"], "like", 6),
  ];
  const taste = buildTaste(closet, votes, [
    { itemIds: ["tee", "cargo"], verdict: "skipped" },
    { itemIds: ["tee", "cargo"], verdict: "skipped" },
  ]);
  // 6 likes against two half-weight passes: 6 / 7.
  assert.ok(Math.abs(taste.pairRate["tee + cargo pant"] - 6 / 7) < 1e-9);
});

test("swipe counts stay swipe counts", () => {
  const votes = [vote(["tee", "cargo"], "like", 1), vote(["polo", "chino"], "pass", 2)];
  const taste = buildTaste(closet, votes, [{ itemIds: ["tee", "cargo"], verdict: "worn" }]);
  assert.equal(taste.likes, 1);
  assert.equal(taste.passes, 1);
  assert.equal(taste.votes, 3);
});
