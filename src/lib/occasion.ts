export type Climate = "forecast" | "hot" | "cold";
export type Vibe = "everyday" | "gym" | "beach" | "hike" | "dressy" | "travel";

export type Occasion = {
  label: string;
  targetFormality: number;
  tags: string[];
  allowShorts: boolean;
  dressy: boolean;
  climate: Climate;
  vibe: Vibe;
};

const RULES: { match: RegExp; occasion: Omit<Occasion, "label"> }[] = [
  {
    match: /\b(beach|pool|swim|boardwalk|cabana|ocean|lake)\b/i,
    occasion: {
      targetFormality: 2,
      tags: ["weekend", "beach"],
      allowShorts: true,
      dressy: false,
      climate: "hot",
      vibe: "beach",
    },
  },
  {
    match: /\b(gym|workout|run|practice|soccer|hoop|lift)\b/i,
    occasion: {
      targetFormality: 1,
      tags: ["gym"],
      allowShorts: true,
      dressy: false,
      climate: "forecast",
      vibe: "gym",
    },
  },
  {
    match: /\b(hike|trail|camping|outdoors)\b/i,
    occasion: {
      targetFormality: 2,
      tags: ["weekend"],
      allowShorts: true,
      dressy: false,
      climate: "forecast",
      vibe: "hike",
    },
  },
  {
    match: /\b(house|home|errand|coffee|weekend)\b/i,
    occasion: {
      targetFormality: 2,
      tags: ["house", "weekend"],
      allowShorts: true,
      dressy: false,
      climate: "forecast",
      vibe: "everyday",
    },
  },
  {
    match: /\b(class|campus|lecture|school)\b/i,
    occasion: {
      targetFormality: 2,
      tags: ["campus", "weekend"],
      allowShorts: true,
      dressy: false,
      climate: "forecast",
      vibe: "everyday",
    },
  },
  {
    match: /\b(travel|flight|airport)\b/i,
    occasion: {
      targetFormality: 3,
      tags: ["travel", "weekend"],
      allowShorts: false,
      dressy: false,
      climate: "forecast",
      vibe: "travel",
    },
  },
  {
    match: /\b(brunch)\b/i,
    occasion: {
      targetFormality: 3,
      tags: ["weekend", "evening"],
      allowShorts: false,
      dressy: true,
      climate: "forecast",
      vibe: "dressy",
    },
  },
  {
    match: /\b(concert|club|show)\b/i,
    occasion: {
      targetFormality: 3,
      tags: ["weekend", "evening"],
      allowShorts: false,
      dressy: false,
      climate: "forecast",
      vibe: "everyday",
    },
  },
  {
    match: /\b(date|dinner|drinks|party|concert|club|night out)\b/i,
    occasion: {
      targetFormality: 4,
      tags: ["evening", "weekend"],
      allowShorts: false,
      dressy: true,
      climate: "forecast",
      vibe: "dressy",
    },
  },
  {
    match: /\b(interview|office|work|meeting|presentation|conference)\b/i,
    occasion: {
      targetFormality: 4,
      tags: ["evening"],
      allowShorts: false,
      dressy: true,
      climate: "forecast",
      vibe: "dressy",
    },
  },
  {
    match: /\b(wedding|funeral|gala|black tie|graduation|church)\b/i,
    occasion: {
      targetFormality: 5,
      tags: ["evening"],
      allowShorts: false,
      dressy: true,
      climate: "forecast",
      vibe: "dressy",
    },
  },
];

export function parseOccasion(raw: string): Occasion {
  const label = raw.trim();
  for (const rule of RULES) {
    if (rule.match.test(label)) {
      return { label, ...rule.occasion };
    }
  }
  return {
    label,
    targetFormality: 3,
    tags: ["weekend", "evening"],
    allowShorts: false,
    dressy: true,
    climate: "forecast",
    vibe: "dressy",
  };
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
