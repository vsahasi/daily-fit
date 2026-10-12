import OpenAI from "openai";
import { z } from "zod";
import { parseOccasion, type Occasion } from "@/lib/occasion";
import { chatModel } from "@/lib/openai";

/**
 * Reads a typed line ("late night studying", "Boston day 1, cold", "dinner tomorrow")
 * into the brief the engine dresses: setting, formality, time of day, day, place, and
 * any weather the line states outright. A model reads it; the keyword reader in
 * occasion.ts answers when the model cannot, so the page never fails on a parse.
 */

/** Asks the model one question and returns its JSON text. Injected in tests. */
export type Ask = (prompt: string) => Promise<string>;

export type ScenarioContext = {
  /** Today as YYYY-MM-DD in the user's zone. */
  today: string;
  timezone: string;
  /** The user's home as the forecast labels it, "Berkeley, California, United States". */
  home: string;
  /** Null: do not ask a model. Missing: ask the configured one. */
  ask?: Ask | null;
};

const TAGS = ["gym", "campus", "weekend", "evening", "travel", "house", "beach"] as const;
/** The forecast runs this many days ahead; a later day is dressed on the last one read. */
export const MAX_DAYS_AHEAD = 6;

const bounded = (low: number, high: number) =>
  z.coerce.number().transform((n) => Math.min(high, Math.max(low, Math.round(n))));

const briefSchema = z.object({
  vibe: z.enum(["everyday", "gym", "beach", "hike", "dressy", "travel"]),
  targetFormality: bounded(1, 5),
  dressy: z.boolean(),
  allowShorts: z.boolean(),
  tags: z.array(z.string()).transform((tags) => tags.map((tag) => tag.toLowerCase()).filter((tag): tag is (typeof TAGS)[number] => (TAGS as readonly string[]).includes(tag))),
  climate: z.enum(["forecast", "hot", "cold"]),
  when: z.enum(["day", "evening", "night"]),
  dayOffset: bounded(0, MAX_DAYS_AHEAD),
  place: z.string().nullable().optional(),
  temps: z.object({ high: bounded(-40, 130), low: bounded(-40, 130) }).nullable().optional(),
});

type Brief = z.infer<typeof briefSchema>;

const SYSTEM = `You read one line a man typed about where he is going, and turn it into a brief for an outfit engine that dresses him from his own closet. Return JSON with exactly these keys:
vibe: everyday | gym | beach | hike | dressy | travel. "dressy" only when the setting itself asks for a shirt or a nice polo: a date, dinner out, drinks, an interview, the office, a wedding. Studying, errands, class, a walk, hanging out, a long night at a desk are everyday.
targetFormality: 1 to 5. 1 the gym or the couch, 2 errands, class, studying, a casual hang, 3 an ordinary day out, 4 a nice dinner, a date, an interview, the office, 5 a wedding, a funeral, black tie.
dressy: true when targetFormality is 4 or 5, or the setting wants a collar.
allowShorts: true when shorts would be fine if the weather allows (gym, beach, errands, a hot casual day); false for anything dressy, a flight, or cold.
tags: one to three from {gym, campus, weekend, evening, travel, house, beach}. evening for nights out and dressy settings, house for home and studying, campus for class.
climate: forecast | hot | cold. Use hot or cold ONLY when the line says what the weather is (cold, freezing, chilly, hot, heat wave, snow). The time of day is not weather. A trip to a place is not weather unless the line says so.
temps: {high, low} in °F ONLY when the line states temperatures ("45 degrees", "high of 80"); else null.
when: day | evening | night. evening for dinner, drinks, a date, a show, anything from 5pm on; night for "late night", "tonight" alone, after 9pm, a late shift. Otherwise day.
dayOffset: whole days from today. today 0, tomorrow 1, a named weekday is the next one coming (today's own name means today), "this weekend" is the coming Saturday. A trip "day 1" or "day 2" with no date is 0. Never more than 6.
place: a city or region the line names that is not the home city, as a short geocodable name ("Boston", "Lake Tahoe", "New York"); null otherwise, including when it names home.
Read the whole line. Read "cold" in any position, including in parentheses. Be decisive; do not hedge in the JSON. No other keys.`;

function weekday(today: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`));
}

function prompt(text: string, ctx: ScenarioContext) {
  return `Today is ${weekday(ctx.today)}, ${ctx.today}, in the ${ctx.timezone} zone. Home is ${ctx.home}.\nThe line: "${text}"`;
}

function isHome(place: string, home: string) {
  const want = place.trim().toLowerCase();
  if (!want) return true;
  return home
    .toLowerCase()
    .split(",")
    .map((part) => part.trim())
    .some((part) => part === want || part.startsWith(`${want} `) || want.startsWith(part));
}

function toOccasion(label: string, brief: Brief, home: string, fallback: Occasion): Occasion {
  const dressy = brief.dressy || brief.targetFormality >= 4;
  const place = brief.place && !isHome(brief.place, home) ? brief.place.trim() : undefined;
  const temps = brief.temps ? { high: Math.max(brief.temps.high, brief.temps.low), low: Math.min(brief.temps.high, brief.temps.low) } : undefined;
  return {
    label,
    vibe: dressy && brief.vibe === "everyday" ? "dressy" : brief.vibe,
    targetFormality: brief.targetFormality,
    dressy,
    allowShorts: brief.allowShorts && !dressy && brief.climate !== "cold",
    tags: brief.tags.length ? brief.tags : fallback.tags,
    climate: brief.climate,
    ...(brief.when !== "day" ? { when: brief.when } : {}),
    ...(brief.dayOffset > 0 ? { dayOffset: brief.dayOffset } : {}),
    ...(place ? { place } : {}),
    ...(temps ? { temps } : {}),
  };
}

/** The configured model, or null when there is no key to reach it. */
function modelAsk(): Ask | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  // A slow answer is worse than a keyword answer: one try, a short wait.
  const openai = new OpenAI({ apiKey: key, timeout: 12_000, maxRetries: 1 });
  return async (text) => {
    const completion = await openai.chat.completions.create({
      model: chatModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  };
}

export async function readScenario(raw: string, ctx: ScenarioContext): Promise<Occasion> {
  const label = raw.trim();
  const fallback = parseOccasion(label);
  const ask = ctx.ask === undefined ? modelAsk() : ctx.ask;
  if (!ask || !label) return fallback;
  try {
    const brief = briefSchema.parse(JSON.parse(await ask(prompt(label, ctx))));
    return toOccasion(label, brief, ctx.home, fallback);
  } catch {
    return fallback;
  }
}
