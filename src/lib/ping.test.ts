import assert from "node:assert/strict";
import { test } from "node:test";
import { pingBody, pingTarget, pingTitle } from "@/lib/ping";

test("a morning or midday hour dresses today, an evening hour dresses tomorrow", () => {
  assert.equal(pingTarget(7), "today");
  assert.equal(pingTarget(12), "today");
  assert.equal(pingTarget(16), "tomorrow");
  assert.equal(pingTarget(21), "tomorrow");
  assert.equal(pingTarget(0), "today");
});

test("the title says which day the look is for", () => {
  assert.equal(pingTitle("today"), "Today");
  assert.equal(pingTitle("tomorrow"), "Tomorrow");
});

test("with nothing left over the body is just the look", () => {
  assert.equal(
    pingBody({ target: "today", reason: "White tee, Navy cargo. 70° and clear.", leftovers: [] }),
    "White tee, Navy cargo. 70° and clear.",
  );
});

test("the morning body asks about pieces still out from earlier wears", () => {
  const body = pingBody({
    target: "today",
    reason: "White tee, Navy cargo. 70° and clear.",
    leftovers: ["Grey tee", "Black jeans"],
  });
  assert.equal(body, "White tee, Navy cargo. 70° and clear.\nStill out: Grey tee, Black jeans. Wash or keep?");
});

test("the evening body is the hamper pass for what was worn today", () => {
  const body = pingBody({
    target: "tomorrow",
    reason: "Grey tee, Olive cargo. 68° and clear.",
    leftovers: ["White tee", "Navy cargo"],
  });
  assert.equal(body, "Grey tee, Olive cargo. 68° and clear.\nYou wore White tee, Navy cargo. What's dirty?");
});

test("a long leftover list is cut to four names", () => {
  const body = pingBody({
    target: "today",
    reason: "Look.",
    leftovers: ["A", "B", "C", "D", "E", "F"],
  });
  assert.equal(body, "Look.\nStill out: A, B, C, D and 2 more. Wash or keep?");
});
