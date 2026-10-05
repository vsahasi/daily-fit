import assert from "node:assert/strict";
import { test } from "node:test";
import { wornAgo } from "@/lib/names";

test("wornAgo reads like a person would say it, and goes quiet after a week", () => {
  assert.equal(wornAgo(0), "Worn today");
  assert.equal(wornAgo(1), "Worn yesterday");
  assert.equal(wornAgo(4), "Worn 4 days ago");
  assert.equal(wornAgo(7), "Worn a week ago");
  assert.equal(wornAgo(8), null);
  assert.equal(wornAgo(null), null);
  assert.equal(wornAgo(-1), null);
});
