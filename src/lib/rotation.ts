import type { Item } from "@prisma/client";
import { comboKey } from "@/lib/combo";
import { daysBetween } from "@/lib/dates";
import { pairKind, pieceKind } from "@/lib/kinds";

/** A look the user confirmed wearing, on the local calendar date they wore it. */
export type WornLook = { date: string; itemIds: string[] };

/**
 * What was worn, shown, or turned down lately, measured back from the day being dressed.
 * Days are whole calendar days: 0 is that same day, 1 is the day before.
 */
export type Recency = {
  /** Exact stacks confirmed as worn. */
  combos: Record<string, number>;
  /** Exact stacks suggested on an earlier day and never confirmed or turned down. */
  shown: Record<string, number>;
  /** Exact stacks turned down with Not this or Another look. */
  turnedDown: Record<string, number>;
  lastWorn: Record<string, number>;
  wears: Record<string, number>;
  /** Days since each piece was last worn, shown, or turned down. */
  lastSeen: Record<string, number>;
  /** The shape of each recent day ("tee + chino"), and how often it came up this week. */
  kindDays: Record<string, number>;
  kindWears: Record<string, number>;
  /** The kind of each piece worn ("top:polo", "bottom:chino"), by days ago and by wears this week. */
  pieceKindDays: Record<string, number>;
  pieceKindWears: Record<string, number>;
  /** Days since each kind of piece was last worn, shown, or turned down. */
  pieceKindSeen: Record<string, number>;
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
/** An exact stack that was worn sits out this long. */
const SAME_STACK_DAYS = 14;
/** A stack turned down stays away this long; one merely shown, a little less. */
const TURNED_DOWN_DAYS = 10;
const SHOWN_DAYS = 7;

export function buildRecency(
  worn: WornLook[],
  forDate: string,
  opts: { shown?: WornLook[]; turnedDown?: WornLook[]; items?: Item[] } = {},
): Recency {
  const recency: Recency = {
    combos: {},
    shown: {},
    turnedDown: {},
    lastWorn: {},
    wears: {},
    lastSeen: {},
    kindDays: {},
    kindWears: {},
    pieceKindDays: {},
    pieceKindWears: {},
    pieceKindSeen: {},
  };
  const byId = new Map((opts.items ?? []).map((item) => [item.id, item]));
  const piecesOf = (ids: string[]) => ids.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
  const kindOf = (ids: string[]) => pairKind(piecesOf(ids));
  const seen = (ids: string[], daysAgo: number) => {
    for (const piece of piecesOf(ids)) {
      if (piece.category !== "top" && piece.category !== "bottom") continue;
      const key = `${piece.category}:${pieceKind(piece)}`;
      recency.pieceKindSeen[key] = Math.min(recency.pieceKindSeen[key] ?? Infinity, daysAgo);
    }
  };

  for (const look of worn) {
    const daysAgo = daysBetween(look.date, forDate);
    if (daysAgo < 0 || daysAgo > LOOKBACK_DAYS) continue;
    const key = comboKey(look.itemIds);
    recency.combos[key] = Math.min(recency.combos[key] ?? Infinity, daysAgo);
    for (const id of look.itemIds) {
      recency.lastWorn[id] = Math.min(recency.lastWorn[id] ?? Infinity, daysAgo);
      recency.lastSeen[id] = Math.min(recency.lastSeen[id] ?? Infinity, daysAgo);
      if (daysAgo <= WEEK_DAYS) recency.wears[id] = (recency.wears[id] ?? 0) + 1;
    }
    const kind = kindOf(look.itemIds);
    if (kind) {
      recency.kindDays[kind] = Math.min(recency.kindDays[kind] ?? Infinity, daysAgo);
      if (daysAgo <= WEEK_DAYS) recency.kindWears[kind] = (recency.kindWears[kind] ?? 0) + 1;
    }
    for (const piece of piecesOf(look.itemIds)) {
      if (piece.category !== "top" && piece.category !== "bottom") continue;
      const key = `${piece.category}:${pieceKind(piece)}`;
      recency.pieceKindDays[key] = Math.min(recency.pieceKindDays[key] ?? Infinity, daysAgo);
      if (daysAgo <= WEEK_DAYS) recency.pieceKindWears[key] = (recency.pieceKindWears[key] ?? 0) + 1;
    }
    seen(look.itemIds, daysAgo);
  }
  for (const look of opts.shown ?? []) {
    const daysAgo = daysBetween(look.date, forDate);
    if (daysAgo < 0 || daysAgo > LOOKBACK_DAYS) continue;
    const key = comboKey(look.itemIds);
    recency.shown[key] = Math.min(recency.shown[key] ?? Infinity, daysAgo);
    for (const id of look.itemIds) recency.lastSeen[id] = Math.min(recency.lastSeen[id] ?? Infinity, daysAgo);
    seen(look.itemIds, daysAgo);
  }
  for (const look of opts.turnedDown ?? []) {
    const daysAgo = daysBetween(look.date, forDate);
    if (daysAgo < 0 || daysAgo > LOOKBACK_DAYS) continue;
    const key = comboKey(look.itemIds);
    recency.turnedDown[key] = Math.min(recency.turnedDown[key] ?? Infinity, daysAgo);
    for (const id of look.itemIds) recency.lastSeen[id] = Math.min(recency.lastSeen[id] ?? Infinity, daysAgo);
    seen(look.itemIds, daysAgo);
  }
  return recency;
}

/** How hard a repeat is held back, by piece type. Tops rotate; trousers can come back sooner. */
const REPEAT_COST: Record<string, { nextDay: number; soon: number; perExtraWear: number }> = {
  top: { nextDay: 24, soon: 10, perExtraWear: 5 },
  bottom: { nextDay: 12, soon: 5, perExtraWear: 3 },
  outer: { nextDay: 6, soon: 4, perExtraWear: 4 },
};

/** What a piece nobody has seen in two weeks is worth. Something has to pull the back of the closet forward. */
const FRESH_BONUS: Record<string, number> = { top: 6, bottom: 4 };

/** How hard the same kind of piece two days running, or all week, is held back. */
const KIND_COST: Record<string, { nextDay: number; perExtraWeekly: number; weeklyFree: number }> = {
  top: { nextDay: 6, perExtraWeekly: 5, weeklyFree: 2 },
  "top:polo": { nextDay: 12, perExtraWeekly: 10, weeklyFree: 1 },
  bottom: { nextDay: 2, perExtraWeekly: 3, weeklyFree: 3 },
};

/**
 * Keeps the closet moving. The exact stack sits out two weeks once worn, ten days once
 * turned down, a week once merely shown. Yesterday's top sits out. The shape of the day
 * changes too: a tee on work pants two days running costs something, three days more,
 * and a polo every day of the week costs more with each one.
 * These are penalties, never exclusions: a two-piece closet still gets dressed.
 */
export function rotationScore(items: { id: string; category: string }[], recency?: Recency) {
  const reasons: string[] = [];
  if (!recency) return { score: 0, reasons };
  let score = 0;

  // The stack is the clothes. Shoes carry no repeat cost, and a change of shoes does not make it new.
  const clothes = items.filter((item) => item.category !== "shoes");
  const key = comboKey(clothes.map((item) => item.id));
  const stackAge = recency.combos[key];
  if (stackAge != null && stackAge <= SAME_STACK_DAYS) score -= 200;
  const turnedDownAge = recency.turnedDown[key];
  if (turnedDownAge != null && turnedDownAge <= TURNED_DOWN_DAYS) score -= 80;
  const shownAge = recency.shown[key];
  if (shownAge != null && shownAge <= SHOWN_DAYS) score -= 40;

  for (const item of items) {
    const cost = REPEAT_COST[item.category];
    const daysAgo = recency.lastWorn[item.id];
    if (!cost || daysAgo == null) continue;
    if (daysAgo <= 1) score -= cost.nextDay;
    else if (daysAgo <= 5) score -= cost.soon;
    if (daysAgo <= WEEK_DAYS) score -= Math.min(15, cost.perExtraWear * Math.max(0, (recency.wears[item.id] ?? 0) - 1));
  }

  const full = items.filter((item): item is Item => "name" in item);
  const kind = pairKind(full);
  if (kind) {
    const kindAge = recency.kindDays[kind];
    if (kindAge != null && kindAge <= 1) score -= 8;
    const weekly = recency.kindWears[kind] ?? 0;
    if (weekly >= 3) score -= Math.min(18, (weekly - 2) * 6);
  }
  for (const piece of full) {
    const key = `${piece.category}:${pieceKind(piece)}`;
    const cost = KIND_COST[key] ?? KIND_COST[piece.category];
    if (!cost) continue;
    const age = recency.pieceKindDays[key];
    if (age != null && age <= 1) score -= cost.nextDay;
    const weekly = recency.pieceKindWears[key] ?? 0;
    if (weekly > cost.weeklyFree) score -= Math.min(25, (weekly - cost.weeklyFree) * cost.perExtraWeekly);
  }

  if (Object.keys(recency.lastSeen).length) {
    for (const item of items) {
      const bonus = FRESH_BONUS[item.category];
      if (bonus && recency.lastSeen[item.id] == null) score += bonus;
    }
  }

  const top = items.find((item) => item.category === "top");
  const bottom = items.find((item) => item.category === "bottom");
  const bottomRecent = bottom != null && (recency.lastWorn[bottom.id] ?? Infinity) <= 3;
  const topFresh = top != null && (recency.lastWorn[top.id] ?? Infinity) > 3;
  if (bottomRecent && topFresh) reasons.push("Bottoms from earlier this week, a top you have not worn");

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
