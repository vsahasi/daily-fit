export type Climate = "forecast" | "hot" | "cold";
export type Vibe = "everyday" | "gym" | "beach" | "hike" | "dressy" | "travel";
/** When the hours out fall. An evening or a night is dressed for the cool end of the day. */
export type When = "day" | "evening" | "night";

export type Occasion = {
  label: string;
  targetFormality: number;
  tags: string[];
  allowShorts: boolean;
  dressy: boolean;
  climate: Climate;
  vibe: Vibe;
  when?: When;
  /** Days from today: 1 for tomorrow. Missing means today. */
  dayOffset?: number;
  /** A city the scenario happens in, when it is not home. */
  place?: string;
  /** Temperatures the text states outright, in °F. */
  temps?: { high: number; low: number };
};

type Brief = Omit<Occasion, "label">;

/** The setting: the first rule that matches wins, so the specific ones come first. */
const RULES: { match: RegExp; brief: Brief }[] = [
  {
    match: /\b(beach|pool|swim|boardwalk|cabana|ocean|lake)\b/i,
    brief: { targetFormality: 2, tags: ["weekend", "beach"], allowShorts: true, dressy: false, climate: "hot", vibe: "beach" },
  },
  {
    match: /\b(errands?)\b/i,
    brief: { targetFormality: 2, tags: ["house", "weekend"], allowShorts: true, dressy: false, climate: "forecast", vibe: "everyday" },
  },
  {
    match: /\b(gym|workout|working out|run|jog|practice|soccer|hoops?|basketball|lift|lifting|training)\b/i,
    brief: { targetFormality: 1, tags: ["gym"], allowShorts: true, dressy: false, climate: "forecast", vibe: "gym" },
  },
  {
    match: /\b(hike|hiking|trail|camping|outdoors)\b/i,
    brief: { targetFormality: 2, tags: ["weekend"], allowShorts: true, dressy: false, climate: "forecast", vibe: "hike" },
  },
  {
    match: /\b(stud(y|ying)|library|homework|chill|chilling|lazy|cozy|lounge|lounging|netflix|movie night|hang(ing)? out|relax(ing)?|at home|staying in)\b/i,
    brief: { targetFormality: 2, tags: ["house", "campus"], allowShorts: true, dressy: false, climate: "forecast", vibe: "everyday" },
  },
  {
    match: /\b(house|home|coffee|weekend)\b/i,
    brief: { targetFormality: 2, tags: ["house", "weekend"], allowShorts: true, dressy: false, climate: "forecast", vibe: "everyday" },
  },
  {
    match: /\b(class|campus|lecture|school)\b/i,
    brief: { targetFormality: 2, tags: ["campus", "weekend"], allowShorts: true, dressy: false, climate: "forecast", vibe: "everyday" },
  },
  {
    match: /\b(travel|flight|airport|plane)\b/i,
    brief: { targetFormality: 3, tags: ["travel", "weekend"], allowShorts: false, dressy: false, climate: "forecast", vibe: "travel" },
  },
  {
    match: /\b(brunch)\b/i,
    brief: { targetFormality: 3, tags: ["weekend", "evening"], allowShorts: false, dressy: true, climate: "forecast", vibe: "dressy" },
  },
  {
    match: /\b(concert|club|show)\b/i,
    brief: { targetFormality: 3, tags: ["weekend", "evening"], allowShorts: false, dressy: false, climate: "forecast", vibe: "everyday" },
  },
  {
    match: /\b(date|dinner|drinks|party|night out)\b/i,
    brief: { targetFormality: 4, tags: ["evening", "weekend"], allowShorts: false, dressy: true, climate: "forecast", vibe: "dressy" },
  },
  {
    match: /\b(interview|office|work|meeting|presentation|conference)\b/i,
    brief: { targetFormality: 4, tags: ["evening"], allowShorts: false, dressy: true, climate: "forecast", vibe: "dressy" },
  },
  {
    match: /\b(wedding|funeral|gala|black tie|graduation|church)\b/i,
    brief: { targetFormality: 5, tags: ["evening"], allowShorts: false, dressy: true, climate: "forecast", vibe: "dressy" },
  },
];

/** Nothing named: an ordinary day, which the forecast then dresses. */
const PLAIN: Brief = { targetFormality: 3, tags: ["campus", "weekend", "house"], allowShorts: true, dressy: false, climate: "forecast", vibe: "everyday" };

/**
 * The words in a line that say when and in what weather, read on top of the setting.
 * Keyword reading is the fallback behind the model in scenario.ts, so it stays modest.
 */
function modifiers(label: string): Partial<Brief> {
  const out: Partial<Brief> = {};
  if (/\b(cold|freezing|chilly|frigid|snow|snowy|winter|icy)\b/i.test(label)) {
    out.climate = "cold";
    out.allowShorts = false;
  } else if (/\b(hot|heat|heatwave|heat wave|scorching|sweltering|humid|boiling)\b/i.test(label)) {
    out.climate = "hot";
  }
  if (/\b(tonight|late night|late|night|midnight|after dark)\b/i.test(label)) {
    out.when = /\b(late|midnight|after dark|late night)\b/i.test(label) ? "night" : /\b(tonight)\b/i.test(label) && /\b(dinner|drinks|date|party)\b/i.test(label) ? "evening" : "night";
  } else if (/\b(evening|dinner|drinks|sunset|pm)\b/i.test(label)) {
    out.when = "evening";
  }
  if (/\b(tomorrow)\b/i.test(label)) out.dayOffset = 1;
  else if (/\b(day after tomorrow)\b/i.test(label)) out.dayOffset = 2;
  return out;
}

/** Reads a typed line by keyword alone. The model-backed reader in scenario.ts goes first when it can. */
export function parseOccasion(raw: string): Occasion {
  const label = raw.trim();
  const rule = RULES.find((row) => row.match.test(label));
  const brief = rule ? rule.brief : PLAIN;
  return { label, ...brief, ...modifiers(label) };
}

export function everydayOccasion(): Occasion {
  return {
    label: "everyday",
    targetFormality: 3,
    tags: ["campus", "weekend", "house"],
    allowShorts: true,
    dressy: false,
    climate: "forecast",
    vibe: "everyday",
  };
}

export const LOOK_SCENARIOS: { slug: string; label: string; occasion: Occasion }[] = [
  { slug: "everyday", label: "Everyday", occasion: everydayOccasion() },
  {
    slug: "hot",
    label: "Hot day",
    occasion: { ...everydayOccasion(), label: "a hot day", climate: "hot" },
  },
  {
    slug: "cold",
    label: "Cold day",
    occasion: {
      ...everydayOccasion(),
      label: "a cold day",
      climate: "cold",
      allowShorts: false,
    },
  },
  {
    slug: "beach",
    label: "Beach",
    occasion: parseOccasion("beach"),
  },
  {
    slug: "gym",
    label: "Gym",
    occasion: parseOccasion("gym"),
  },
  {
    slug: "brunch",
    label: "Brunch",
    occasion: parseOccasion("brunch"),
  },
  {
    slug: "dinner",
    label: "Dinner",
    occasion: parseOccasion("dinner"),
  },
  {
    slug: "interview",
    label: "Interview",
    occasion: parseOccasion("job interview"),
  },
];

export function scenarioBySlug(slug: string | null | undefined) {
  return LOOK_SCENARIOS.find((row) => row.slug === slug) ?? LOOK_SCENARIOS[0];
}

export function occasionFromWeatherJson(json: string): Occasion | null {
  try {
    const stored = JSON.parse(json) as { occasion?: Occasion };
    if (stored.occasion?.label) {
      const occasion = stored.occasion;
      return {
        ...parseOccasion(occasion.label),
        ...occasion,
        climate: occasion.climate ?? "forecast",
        vibe: occasion.vibe ?? (occasion.dressy ? "dressy" : "everyday"),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** What was read from the line, for the page: "casual, at night, in the cold". */
export function describeOccasion(o: Occasion): string {
  const setting =
    o.vibe === "gym" ? "the gym"
    : o.vibe === "beach" ? "the beach"
    : o.vibe === "hike" ? "a hike"
    : o.vibe === "travel" ? "travel"
    : o.dressy ? (o.targetFormality >= 5 ? "formal" : "dressy")
    : o.targetFormality <= 2 ? "casual" : "everyday";
  const parts = [setting];
  if (o.when === "evening") parts.push("in the evening");
  else if (o.when === "night") parts.push("at night");
  if (o.temps) parts.push(o.temps.high === o.temps.low ? `${o.temps.high}°` : `${o.temps.high}° to ${o.temps.low}°`);
  else if (o.climate === "hot") parts.push("in the heat");
  else if (o.climate === "cold") parts.push("in the cold");
  if (o.dayOffset === 1) parts.push("tomorrow");
  else if (o.dayOffset && o.dayOffset > 1) parts.push(`in ${o.dayOffset} days`);
  if (o.place) parts.push(`in ${o.place}`);
  return parts.join(", ");
}
