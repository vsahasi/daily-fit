import type { Item } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { everydayOccasion, parseOccasion } from "../src/lib/occasion";
import { pickLook, scoreLook } from "../src/lib/pair";
import type { Weather } from "../src/lib/types";

const PHONE = process.env.INGEST_PHONE ?? "";

const mild: Weather = {
  date: "2026-09-16",
  tempMin: 58,
  tempMax: 70,
  precipProb: 10,
  code: 1,
  summary: "clear",
  locationLabel: "Berkeley",
};

const hot: Weather = { ...mild, tempMin: 64, tempMax: 82, summary: "hot" };
const cold: Weather = { ...mild, tempMin: 48, tempMax: 56, summary: "cold" };

function hash(value: string) {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) n = (n * 31 + value.charCodeAt(i)) >>> 0;
  return n;
}

function rareDressyKey(suffix: string) {
  for (let day = 1; day <= 28; day += 1) {
    const key = `2026-09-${String(day).padStart(2, "0")}:${suffix}`;
    if (hash(key) % 5 === 0) return key;
  }
  return `2026-09-01:${suffix}`;
}

function line(items: Item[], ids: string[], score: number, reason: string) {
  const names = ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item))
    .map((item) => `${item.name} [${item.formality}/${item.subcategory}]`);
  return `${score.toFixed(0)}  ${names.join(" + ")}  | ${reason}`;
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { phone: PHONE } });
  const items = await prisma.item.findMany({ where: { userId: user.id, status: "available" } });
  const scenarios = [
    { label: "everyday mild", occasion: everydayOccasion(), weather: mild, dateKey: "2026-09-16:everyday" },
    { label: "everyday rare dressy", occasion: everydayOccasion(), weather: mild, dateKey: rareDressyKey("everyday") },
    { label: "everyday hot", occasion: everydayOccasion(), weather: hot, dateKey: "2026-09-16:everyday" },
    { label: "everyday cold", occasion: everydayOccasion(), weather: cold, dateKey: "2026-09-16:everyday" },
    { label: "dinner", occasion: parseOccasion("dinner tomorrow"), weather: mild, dateKey: "dinner" },
    { label: "interview", occasion: parseOccasion("job interview"), weather: mild, dateKey: "interview" },
    { label: "gym", occasion: parseOccasion("gym"), weather: hot, dateKey: "gym" },
    { label: "beach", occasion: parseOccasion("beach day"), weather: mild, dateKey: "beach" },
    { label: "brunch", occasion: parseOccasion("brunch"), weather: mild, dateKey: "brunch" },
    { label: "hike", occasion: parseOccasion("hike"), weather: mild, dateKey: "hike" },
    { label: "wedding", occasion: parseOccasion("wedding"), weather: mild, dateKey: "wedding" },
  ];

  for (const scenario of scenarios) {
    console.log(`\n=== ${scenario.label} ===`);
    const best = pickLook({
      items,
      weather: scenario.weather,
      skippedCombos: [],
      occasion: scenario.occasion,
      dateKey: scenario.dateKey,
    });
    console.log("BEST", line(items, best.itemIds, best.score, best.reason));

    const tops = items.filter((item) => item.category === "top");
    const bottoms = items.filter((item) => item.category === "bottom");
    const ranked: { ids: string[]; score: number; reason: string }[] = [];
    for (const top of tops) {
      for (const bottom of bottoms) {
        const pieces = [top, bottom];
        const scored = scoreLook(pieces, scenario.weather, scenario.occasion, scenario.dateKey);
        ranked.push({ ids: pieces.map((item) => item.id), score: scored.score, reason: scored.reasons[0] ?? "" });
      }
    }
    ranked.sort((a, b) => b.score - a.score);
    for (const row of ranked.slice(0, 5)) {
      console.log(" ", line(items, row.ids, row.score, row.reason));
    }
    console.log(" WORST", line(items, ranked[ranked.length - 1].ids, ranked[ranked.length - 1].score, ranked[ranked.length - 1].reason));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
