import assert from "node:assert/strict";
import { test } from "node:test";
import { hoursOut } from "@/lib/weather";

function day(date: string, temps: number[]) {
  return {
    time: temps.map((_, hour) => `${date}T${String(hour).padStart(2, "0")}:00`),
    apparent_temperature: temps,
  };
}

test("hoursOut reads the feels-like range from 8am to 8pm and the 9am number", () => {
  // 3am is the coldest hour and 3pm the warmest; neither dawn nor midnight should count.
  const temps = [50, 49, 48, 47, 48, 50, 52, 54, 56, 58, 62, 66, 69, 71, 72, 72, 70, 67, 63, 60, 58, 55, 53, 51];
  const out = hoursOut(day("2026-09-29", temps), "2026-09-29");
  assert.deepEqual(out, { outHigh: 72, outLow: 56, morning: 58 });
});

test("hoursOut ignores other days and copes with no hourly data", () => {
  const two = day("2026-09-28", Array(24).fill(90));
  const merged = { time: [...two.time, ...day("2026-09-29", Array(24).fill(60)).time], apparent_temperature: [...two.apparent_temperature, ...Array(24).fill(60)] };
  assert.deepEqual(hoursOut(merged, "2026-09-29"), { outHigh: 60, outLow: 60, morning: 60 });
  assert.deepEqual(hoursOut(undefined, "2026-09-29"), {});
});
