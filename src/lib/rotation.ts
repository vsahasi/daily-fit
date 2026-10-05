import { comboKey } from "@/lib/combo";
import { daysBetween } from "@/lib/dates";

/** A look the user confirmed wearing, on the local calendar date they wore it. */
export type WornLook = { date: string; itemIds: string[] };

/**
 * What was worn lately, measured back from the day being dressed.
 * Days are whole calendar days: 0 is that same day, 1 is the day before.
 */
export type Recency = {
  combos: Record<string, number>;
  lastWorn: Record<string, number>;
  wears: Record<string, number>;
};

export type Decision = "wash" | "keep";

export type WornRecord = {
  id: string;
  date: string;
  itemIds: string[];
  decisions: Record<string, Decision>;
};

const LOOKBACK_DAYS = 14;
const WEEK_DAYS = 7;
const SAME_STACK_DAYS = 6;

export function buildRecency(worn: WornLook[], forDate: string): Recency {
  const recency: Recency = { combos: {}, lastWorn: {}, wears: {} };
  for (const look of worn) {
    const daysAgo = daysBetween(look.date, forDate);
    if (daysAgo < 0 || daysAgo > LOOKBACK_DAYS) continue;
    const key = comboKey(look.itemIds);
    recency.combos[key] = Math.min(recency.combos[key] ?? Infinity, daysAgo);
    for (const id of look.itemIds) {
      recency.lastWorn[id] = Math.min(recency.lastWorn[id] ?? Infinity, daysAgo);
      if (daysAgo <= WEEK_DAYS) recency.wears[id] = (recency.wears[id] ?? 0) + 1;
    }
  }
  return recency;
}

/** How hard a repeat is held back, by piece type. Tops rotate; trousers can come back sooner. */
const REPEAT_COST: Record<string, { nextDay: number; soon: number; perExtraWear: number }> = {
  top: { nextDay: 16, soon: 8, perExtraWear: 4 },
  bottom: { nextDay: 8, soon: 3, perExtraWear: 2 },
  outer: { nextDay: 3, soon: 0, perExtraWear: 0 },
};

/**
 * Keeps the closet rotating inside what the user likes. The exact stack sits out for
 * about a week; a single repeated piece costs less, so the trousers can return with a new top.
 * These are penalties, never exclusions: a two-piece closet still gets dressed.
 */
export function rotationScore(items: { id: string; category: string }[], recency?: Recency) {
  const reasons: string[] = [];
  if (!recency) return { score: 0, reasons };
  let score = 0;

  const stackAge = recency.combos[comboKey(items.map((item) => item.id))];
  if (stackAge != null && stackAge <= SAME_STACK_DAYS) score -= 45;

  for (const item of items) {
    const cost = REPEAT_COST[item.category];
    const daysAgo = recency.lastWorn[item.id];
    if (!cost || daysAgo == null) continue;
    if (daysAgo <= 1) score -= cost.nextDay;
    else if (daysAgo <= 3) score -= cost.soon;
    if (daysAgo <= WEEK_DAYS) score -= cost.perExtraWear * Math.max(0, (recency.wears[item.id] ?? 0) - 1);
  }

  const top = items.find((item) => item.category === "top");
  const bottom = items.find((item) => item.category === "bottom");
  const bottomRecent = bottom != null && (recency.lastWorn[bottom.id] ?? Infinity) <= 3;
  const topFresh = top != null && (recency.lastWorn[top.id] ?? Infinity) > 3;
  if (bottomRecent && topFresh) reasons.push("Same trousers, a top you have not worn this week");

  return { score, reasons };
}

export function parseDecisions(json: string | null | undefined): Record<string, Decision> {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, Decision> = {};
    for (const [id, value] of Object.entries(raw ?? {})) {
      if (value === "wash" || value === "keep") out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Worn pieces nobody has called wash-or-keep on, within an inclusive date window.
 * Only the most recent wear of a piece matters: a call there settles the earlier ones.
 */
export function undecidedPieces(records: WornRecord[], window: { from: string; to: string }) {
  const newestFirst = records
    .filter((row) => daysBetween(window.from, row.date) >= 0 && daysBetween(row.date, window.to) >= 0)
    .sort((a, b) => daysBetween(a.date, b.date));
  const seen = new Set<string>();
  const out: { outfitId: string; itemId: string }[] = [];
  for (const row of newestFirst) {
    for (const itemId of row.itemIds) {
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      if (!row.decisions[itemId]) out.push({ outfitId: row.id, itemId });
    }
  }
  return out;
}
