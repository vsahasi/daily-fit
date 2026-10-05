import assert from "node:assert/strict";
import { test } from "node:test";
import { daysBetween, shiftDate, tomorrowInZone, yesterdayInZone } from "@/lib/dates";

test("shiftDate moves a calendar date across month and year edges", () => {
  assert.equal(shiftDate("2026-09-17", 1), "2026-09-18");
  assert.equal(shiftDate("2026-09-30", 1), "2026-10-01");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDate("2026-03-01", -3), "2026-02-26");
});

test("shiftDate ignores an :event suffix on stored outfit dates", () => {
  assert.equal(shiftDate("2026-09-17:event", 1), "2026-09-18");
});

test("daysBetween counts whole days from the first date to the second", () => {
  assert.equal(daysBetween("2026-09-16", "2026-09-17"), 1);
  assert.equal(daysBetween("2026-09-17", "2026-09-17"), 0);
  assert.equal(daysBetween("2026-09-17", "2026-09-10"), -7);
  assert.equal(daysBetween("2026-02-27", "2026-03-02"), 3);
});

test("tomorrow and yesterday are calendar days in the user's zone, not 24h offsets", () => {
  // 06:30 UTC on Nov 1 2026 is still Oct 31 in Los Angeles.
  const moment = new Date("2026-11-01T06:30:00Z");
  assert.equal(tomorrowInZone("America/Los_Angeles", moment), "2026-11-01");
  assert.equal(yesterdayInZone("America/Los_Angeles", moment), "2026-10-30");
});
