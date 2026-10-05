/**
 * Battle corpus: what the engine actually picks from the real closet across the weather
 * it will meet. Writes Markdown for a reviewer. Usage:
 *   npx tsx --env-file=.env scripts/battle.ts out.md
 */
import fs from "node:fs/promises";
import type { Item } from "@prisma/client";
import { planDay } from "../src/lib/bands";
import { prisma } from "../src/lib/db";
import { families } from "../src/lib/garment";
import { layerRole, pairKind, pieceKind, sleeveLength } from "../src/lib/kinds";
import { layerKind } from "../src/lib/layering";
import { everydayOccasion, parseOccasion } from "../src/lib/occasion";
import { pickLook, rankLooks, swapPiece } from "../src/lib/pair";
import { register } from "../src/lib/register";
import { buildRecency } from "../src/lib/rotation";
import type { DayFeel, Weather } from "../src/lib/types";

const feel = (over: Partial<DayFeel>): DayFeel => ({
  high: 70, low: 56, lowEff: 55, dawn: 55, swing: 15, coolHours: 2, eveningEff: 60, windMax: 7, sunFrac: 0.8,
  popOut: 0, precipHours: 0, drizzle: false, rain: false, heavyRain: false, fog: false, fogPastNoon: false, ...over,
});
const day = (summary: string, f: Partial<DayFeel>, code = 1): Weather => {
  const full = feel(f);
  return { date: "2026-10-01", tempMin: full.low - 3, tempMax: full.high, precipProb: full.popOut, code, summary, locationLabel: "Berkeley", feel: full };
};

const SCENARIOS: [string, Weather, string?][] = [
  ["Scorching 90, clear, 66 morning", day("clear", { high: 90, low: 66, lowEff: 68, dawn: 66, swing: 24, coolHours: 0, eveningEff: 76, sunFrac: 0.95 }, 0)],
  ["Hot 82, clear, 60 morning", day("clear", { high: 82, low: 60, lowEff: 60, dawn: 60, swing: 22, coolHours: 0, eveningEff: 68, sunFrac: 0.95 }, 0)],
  ["Warm 76 steady, 62 morning", day("clear", { high: 76, low: 62, lowEff: 62, dawn: 63, swing: 13, coolHours: 0, eveningEff: 66, sunFrac: 0.9 })],
  ["Warm 76 swing, foggy 54 morning (the Berkeley day)", day("mostly clear", { high: 76, low: 55, lowEff: 51, dawn: 54, swing: 22, coolHours: 2, eveningEff: 62, sunFrac: 0.8, fog: true })],
  ["Warm 74 with rain 60% afternoon", day("rain showers", { high: 74, low: 60, lowEff: 58, dawn: 60, swing: 14, coolHours: 1, eveningEff: 62, sunFrac: 0.3, popOut: 60, precipHours: 3, rain: true }, 80)],
  ["Mild 68 sunny, 60 morning", day("clear", { high: 68, low: 60, lowEff: 60, dawn: 60, swing: 8, coolHours: 0, eveningEff: 62, sunFrac: 0.9 })],
  ["Mild 67, cool 52 morning, sunny", day("clear", { high: 67, low: 53, lowEff: 51, dawn: 53, swing: 14, coolHours: 3, eveningEff: 58, sunFrac: 0.85 })],
  ["Overcast 70, fog past noon (dresses like 65)", day("overcast", { high: 70, low: 57, lowEff: 52, dawn: 57, swing: 13, coolHours: 5, eveningEff: 58, sunFrac: 0.2, fog: true, fogPastNoon: true }, 3)],
  ["Cool 62 sunny, 54 morning", day("clear", { high: 62, low: 54, lowEff: 53, dawn: 54, swing: 8, coolHours: 7, eveningEff: 56, sunFrac: 0.8 })],
  ["Cool 60, wind 17 mph", day("partly cloudy", { high: 60, low: 53, lowEff: 46, dawn: 53, swing: 7, coolHours: 13, eveningEff: 50, windMax: 17, sunFrac: 0.5 }, 2)],
  ["Cold 55 dry and still, 50 morning", day("partly cloudy", { high: 55, low: 50, lowEff: 49, dawn: 50, swing: 5, coolHours: 13, eveningEff: 51, windMax: 5, sunFrac: 0.5 }, 2)],
  ["Cold 54, drizzle 35%", day("light drizzle", { high: 54, low: 49, lowEff: 47, dawn: 49, swing: 5, coolHours: 13, eveningEff: 49, sunFrac: 0.15, popOut: 35, precipHours: 1, drizzle: true }, 51)],
  ["Cold 54, rain 75%, wind 14 mph", day("rain", { high: 54, low: 47, lowEff: 41, dawn: 47, swing: 7, coolHours: 13, eveningEff: 45, windMax: 14, sunFrac: 0.05, popOut: 75, precipHours: 6, rain: true }, 61)],
  ["Freezing 46 clear", day("clear", { high: 46, low: 38, lowEff: 36, dawn: 38, swing: 8, coolHours: 13, eveningEff: 40, sunFrac: 0.8 }, 0)],
  ["Gym on a mild 68 day", day("clear", { high: 68, low: 58, lowEff: 58, dawn: 58, swing: 10, coolHours: 1, eveningEff: 61, sunFrac: 0.9 }), "gym"],
  ["Dinner on a cool 62 evening", day("clear", { high: 62, low: 54, lowEff: 53, dawn: 54, swing: 8, coolHours: 7, eveningEff: 55, sunFrac: 0.8 }), "dinner"],
  ["Interview on a warm 74 day", day("clear", { high: 74, low: 60, lowEff: 60, dawn: 60, swing: 14, coolHours: 0, eveningEff: 65, sunFrac: 0.9 }), "an interview"],
  ["Beach day", day("clear", { high: 78, low: 62, lowEff: 62, dawn: 62, swing: 16, coolHours: 0, eveningEff: 68, sunFrac: 0.95 }, 0), "the beach"],
  ["Hike on a cool 60 morning", day("partly cloudy", { high: 60, low: 50, lowEff: 49, dawn: 50, swing: 10, coolHours: 9, eveningEff: 54, sunFrac: 0.6 }, 2), "a hike"],
  ["Flight on a mild 66 day", day("clear", { high: 66, low: 56, lowEff: 56, dawn: 56, swing: 10, coolHours: 3, eveningEff: 59, sunFrac: 0.8 }), "a flight"],
  ["Brunch on a warm 73 day", day("clear", { high: 73, low: 60, lowEff: 60, dawn: 60, swing: 13, coolHours: 0, eveningEff: 64, sunFrac: 0.9 }), "brunch"],
  ["Wedding on a hot 84 day", day("clear", { high: 84, low: 64, lowEff: 64, dawn: 64, swing: 20, coolHours: 0, eveningEff: 72, sunFrac: 0.95 }, 0), "a wedding"],
  ["Class on a cool rainy 58 day", day("rain", { high: 58, low: 51, lowEff: 48, dawn: 51, swing: 7, coolHours: 13, eveningEff: 50, windMax: 9, sunFrac: 0.1, popOut: 65, precipHours: 4, rain: true }, 61), "class"],
];

/** Pieces sent to the wash for the "half the closet is dirty" runs: the favourites go first. */
const DIRTY = /White Patagonia|Grey Vuori|COS White|Navy Cargo|Olive Abercrombie|Charcoal Cargo|Black Cargo Work|Forest Green|Bocce|Steel City|Black Old Navy|Khaki Slim|Ultraboost|Lululemon/;
const LEAN: [string, Weather][] = [
  ["LEAN CLOSET (favourites in the wash): Warm 76 swing, foggy 54 morning", SCENARIOS[3][1]],
  ["LEAN CLOSET (favourites in the wash): Cool 62 sunny", SCENARIOS[8][1]],
  ["LEAN CLOSET (favourites in the wash): Cold 54, rain 75%, wind 14 mph", SCENARIOS[12][1]],
];

async function main() {
  const out = process.argv[2] ?? "battle.md";
  const user = await prisma.user.findFirstOrThrow();
  const all = await prisma.item.findMany({ where: { userId: user.id, NOT: { imagePath: "" } } });
  // Battle with a full clean closet, so every piece can be reached.
  const items = all.map((item) => ({ ...item, status: "available" }));
  const byId = new Map(items.map((item) => [item.id, item]));
  const pieces = (ids: string[]) => ids.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
  const show = (ids: string[]) => pieces(ids).map((item) => item.name).join(" + ");
  const lines: string[] = [];
  const say = (line = "") => lines.push(line);

  say("# Daily Fit battle corpus");
  say();
  say("## Closet");
  say();
  say("| Piece | Category | Kind | Layer kind / role | Register | Warmth | Sleeve | Colors | Rain ok |");
  say("|---|---|---|---|---|---|---|---|---|");
  for (const item of [...items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) {
    const top = item.category === "top" || item.category === "outer";
    say(`| ${item.name} | ${item.category} | ${pieceKind(item)} | ${top ? `${layerKind(item)} / ${layerRole(item)}` : ""} | ${register(item)} | ${item.warmth} | ${top ? sleeveLength(item) : ""} | ${families(item).join(", ")} | ${item.rainOk ? "yes" : "no"} |`);
  }

  const lean = all.map((item) => ({ ...item, status: DIRTY.test(item.name) ? "wash" : "available" }));
  const runs: [string, Weather, string | undefined, Item[]][] = [
    ...SCENARIOS.map(([label, weather, event]): [string, Weather, string | undefined, Item[]] => [label, weather, event, items]),
    ...LEAN.map(([label, weather]): [string, Weather, string | undefined, Item[]] => [label, weather, undefined, lean]),
  ];
  for (const [label, weather, event, closet] of runs) {
    const items = closet;
    const occasion = event ? parseOccasion(event) : everydayOccasion();
    const plan = planDay(weather, { gym: occasion.vibe === "gym" });
    say();
    say(`## ${label}`);
    say();
    say(`Plan: band ${plan.band} (dresses as ${plan.high}°), felt low ${plan.lowEff}°, sleeves ${plan.sleeves}, top max warmth ${plan.topMaxWarmth}, insulation ${plan.insulation}, layers ${plan.layers.min} to ${plan.layers.max}${plan.layers.removable ? " removable" : ""}, shell ${plan.layers.shell}, wind block ${plan.layers.windBlock}, shorts ${plan.shorts}, sandals ${plan.sandals}, fleece bottoms ${plan.fleece}, rain tier ${plan.rainTier}${event ? `, occasion "${event}"` : ""}.`);
    say();
    say("### Ten days in a row, each one worn");
    say();
    const worn: { date: string; itemIds: string[] }[] = [];
    let first: string[] = [];
    for (let i = 1; i <= 10; i += 1) {
      const date = `2026-10-${String(i).padStart(2, "0")}`;
      const look = pickLook({ items, weather, skippedCombos: [], occasion, dateKey: `${date}:${occasion.label}`, recency: buildRecency(worn, date, { items }) });
      worn.push({ date, itemIds: look.itemIds });
      if (i === 1) first = look.itemIds;
      say(`${i}. ${look.blocked ? `**BLOCKED (${look.blocked})** ` : ""}[${pairKind(pieces(look.itemIds))}] ${show(look.itemIds)} (score ${Math.round(look.score)})`);
      if (i <= 3) say(`   - reason shown: ${look.reason.split(". ").slice(-2).join(". ")}`);
    }
    say();
    say("### Top eight for a first day, no history");
    say();
    for (const look of rankLooks({ items, weather, skippedCombos: [], occasion, dateKey: `2026-10-01:${occasion.label}`, limit: 8 })) {
      say(`- ${show(look.itemIds)} (score ${Math.round(look.score)})`);
    }
    say();
    say("### Another look, five times");
    say();
    const skipped: string[][] = [];
    for (let i = 0; i < 5; i += 1) {
      const look = pickLook({ items, weather, skippedCombos: skipped.map((ids) => [...ids].sort().join("|")), avoidItems: skipped.flat(), occasion, dateKey: `2026-10-01:${occasion.label}` });
      say(`- ${look.blocked ? `**BLOCKED (${look.blocked})** ` : ""}${look.avoided ? "(repeats a skipped piece) " : ""}${show(look.itemIds)}`);
      skipped.push(look.itemIds);
    }
    say();
    say("### Swap each piece of the first day's look");
    say();
    say(`Look: ${show(first)}`);
    for (const id of first) {
      try {
        const swapped = swapPiece({ items, weather, occasion, dateKey: `2026-10-01:${occasion.label}`, current: first, itemId: id });
        const incoming = swapped.itemIds.find((x) => !first.includes(x));
        say(`- swap ${byId.get(id)?.name} for ${incoming ? byId.get(incoming)?.name : "nothing"}${swapped.blocked ? ` **BLOCKED (${swapped.blocked})**` : ""}`);
      } catch (error) {
        say(`- swap ${byId.get(id)?.name}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  }
  await fs.writeFile(out, lines.join("\n"));
  console.log(`wrote ${out}, ${lines.length} lines`);
  await prisma.$disconnect();
}
main();
