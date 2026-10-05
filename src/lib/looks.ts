import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildLikes } from "@/lib/likes";
import { LOOK_SCENARIOS, scenarioBySlug, type Occasion } from "@/lib/occasion";
import { rankLooks } from "@/lib/pair";
import { lookKey, prefsFromVotes, votedKeys } from "@/lib/prefs";
import type { Weather } from "@/lib/types";
import { fetchWeather } from "@/lib/weather";

export type LookCard = {
  itemIds: string[];
  comboKey: string;
  reason: string;
  scenario: string;
  pieces: {
    id: string;
    name: string;
    category: string;
    material: string | null;
    warmth: number;
  }[];
};

const MILD: Weather = {
  date: new Date().toISOString().slice(0, 10),
  tempMin: 58,
  tempMax: 70,
  precipProb: 10,
  code: 1,
  summary: "clear",
  locationLabel: "Berkeley",
};

export async function weatherForUser(user: User): Promise<Weather> {
  if (user.latitude == null || user.longitude == null || !user.locationLabel) {
    return { ...MILD, locationLabel: user.locationLabel ?? "Berkeley" };
  }
  return fetchWeather({
    latitude: user.latitude,
    longitude: user.longitude,
    timezone: user.timezone,
    locationLabel: user.locationLabel,
  });
}

export async function getLookDeck(user: User, slug?: string | null): Promise<{
  scenario: (typeof LOOK_SCENARIOS)[number];
  weather: Weather;
  looks: LookCard[];
}> {
  const scenario = scenarioBySlug(slug);
  const weather = MILD;
  const ignoreWeather = scenario.occasion.climate === "forecast";
  const [items, votes] = await Promise.all([
    prisma.item.findMany({ where: { userId: user.id, NOT: { imagePath: "" } } }),
    prisma.lookVote.findMany({ where: { userId: user.id } }),
  ]);
  const pref = prefsFromVotes(votes);
  const likes = buildLikes(items, pref.liked);
  const skipped = votedKeys(votes);
  const ranked = rankLooks({
    items,
    weather,
    skippedCombos: skipped,
    occasion: scenario.occasion,
    dateKey: `${weather.date}:${scenario.slug}`,
    pref,
    limit: 16,
    ignoreWeather,
    likes,
  });
  const looks = ranked.map((look) => ({
    itemIds: look.itemIds,
    comboKey: lookKey(look.itemIds),
    reason: look.reason,
    scenario: scenario.slug,
    pieces: look.itemIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        material: item.material,
        warmth: item.warmth,
      })),
  }));
  return { scenario, weather, looks };
}

export function occasionForDeck(slug?: string | null): Occasion {
  return scenarioBySlug(slug).occasion;
}
