import type { Item, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { daysBetween, shiftDate } from "@/lib/dates";
import { markClean, putInWash } from "@/lib/laundry";
import {
  buildRecency,
  parseDecisions,
  undecidedPieces,
  type Decision,
  type Recency,
  type WornLook,
} from "@/lib/rotation";

/** How far back an undecided worn piece keeps asking for a wash-or-keep call. */
const LEFTOVER_DAYS = 3;
/** How long a turned-down look or a swapped-out piece keeps nudging the pick away. */
const NUDGE_DAYS = 30;

/** The look for a calendar day: the one confirmed as worn if there is one, else the live suggestion. */
export async function lookForDate(userId: string, date: string) {
  const rows = await prisma.outfit.findMany({
    where: { userId, date, status: { in: ["worn", "suggested"] } },
    orderBy: { createdAt: "desc" },
  });
  return rows.find((row) => row.status === "worn") ?? rows[0] ?? null;
}

/**
 * "I wore this" is the real event. It stamps every piece as worn, which is what
 * rotation reads from. A suggestion alone changes nothing.
 */
export async function wearOutfit(user: User, outfitId: string) {
  const outfit = await prisma.outfit.findFirst({
    where: { id: outfitId, userId: user.id, status: { in: ["suggested", "worn"] } },
  });
  if (!outfit) throw new Error("That look is gone. Make a new one.");
  if (outfit.status === "worn") return outfit;

  const ids = JSON.parse(outfit.itemIds) as string[];
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.outfit.update({ where: { id: outfit.id }, data: { status: "worn", wornAt: now } }),
    prisma.item.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { lastWornAt: now } }),
  ]);
  return updated;
}

/** Undo for a mis-tap, so a look that never left the hanger cannot skew rotation. */
export async function unwearOutfit(user: User, outfitId: string) {
  const outfit = await prisma.outfit.findFirst({
    where: { id: outfitId, userId: user.id, status: "worn" },
  });
  if (!outfit) return;
  // A piece sent to the wash from a look that was never worn goes back in the closet.
  for (const [itemId, choice] of Object.entries(parseDecisions(outfit.decisionsJson))) {
    if (choice === "wash") await markClean(user.id, itemId);
  }
  await prisma.outfit.update({
    where: { id: outfit.id },
    data: { status: "suggested", wornAt: null, decisionsJson: "{}" },
  });

  // Put each piece's last-worn stamp back to its most recent remaining wear, if any.
  const ids = JSON.parse(outfit.itemIds) as string[];
  const remaining = await prisma.outfit.findMany({
    where: { userId: user.id, status: "worn", wornAt: { not: null } },
    orderBy: { wornAt: "desc" },
    select: { itemIds: true, wornAt: true },
    take: 200,
  });
  for (const id of ids) {
    const last = remaining.find((row) => (JSON.parse(row.itemIds) as string[]).includes(id));
    await prisma.item.updateMany({
      where: { id, userId: user.id },
      data: { lastWornAt: last?.wornAt ?? null },
    });
  }
}

/** The hamper call on one worn piece. Wash sends it out of the closet; keep leaves it to be re-worn. */
export async function decidePiece(user: User, outfitId: string, itemId: string, choice: Decision) {
  const outfit = await prisma.outfit.findFirst({
    where: { id: outfitId, userId: user.id, status: "worn" },
  });
  if (!outfit) return;
  const ids = JSON.parse(outfit.itemIds) as string[];
  if (!ids.includes(itemId)) return;

  const decisions = { ...parseDecisions(outfit.decisionsJson), [itemId]: choice };
  await prisma.outfit.update({
    where: { id: outfit.id },
    data: { decisionsJson: JSON.stringify(decisions) },
  });
  if (choice === "wash") await putInWash(user.id, itemId, user.washDays);
  else await markClean(user.id, itemId);
}

/**
 * Everything Today remembers, measured back from `forDate`: what was put on, what was
 * turned down, and what was shown on an earlier day and never answered.
 */
export async function wearHistory(userId: string, forDate: string): Promise<{
  recency: Recency;
  worn: WornLook[];
  /** Turned down in the last month, newest first. */
  turnedDown: WornLook[];
  /** Pieces swapped out of a look in the last month. */
  swappedOut: string[];
}> {
  const [rows, items] = await Promise.all([
    prisma.outfit.findMany({
      where: { userId, status: { in: ["worn", "skipped", "suggested", "swapped", "replaced"] } },
      orderBy: { createdAt: "desc" },
      select: { date: true, itemIds: true, status: true, createdAt: true },
      take: 500,
    }),
    prisma.item.findMany({ where: { userId } }),
  ]);
  const parsed = rows.map((row) => ({
    date: row.date,
    status: row.status,
    itemIds: JSON.parse(row.itemIds) as string[],
    createdAt: row.createdAt,
  }));
  const recent = (row: { date: string }) => {
    const ago = daysBetween(row.date, forDate);
    return ago >= 0 && ago <= NUDGE_DAYS;
  };
  const worn = parsed.filter((row) => row.status === "worn");
  // A pass on an event look says little about the everyday stack, so only plain days count.
  const turnedDown = parsed.filter((row) => row.status === "skipped" && !row.date.includes(":"));
  // A suggestion from an earlier day that was never confirmed or turned down was still seen,
  // and so was a look that had one piece swapped out.
  const shown = parsed.filter(
    (row) =>
      !row.date.includes(":") &&
      ((row.status === "suggested" && row.date < forDate) || row.status === "swapped"),
  );
  // The piece that left in a swap is the one in the old look that is missing from the next look of that day.
  const swappedOut: string[] = [];
  const swaps = parsed.filter((row) => row.status === "swapped");
  for (const old of swaps) {
    if (!recent(old)) continue;
    const next = parsed
      .filter((row) => row.date === old.date && row.createdAt > old.createdAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (!next || next.itemIds.length !== old.itemIds.length) continue;
    // A swap trades exactly one piece. Anything else is a different look, not a swap.
    const gone = old.itemIds.filter((id) => !next.itemIds.includes(id));
    if (gone.length === 1) swappedOut.push(gone[0]);
  }
  return {
    recency: buildRecency(worn, forDate, { shown, turnedDown, items }),
    worn,
    turnedDown: turnedDown.filter(recent),
    swappedOut,
  };
}

export type Leftover = { outfitId: string; item: Item };

/**
 * Pieces worn in the few days before `forDate` that are still in the closet with no
 * wash-or-keep call. In the morning that is yesterday's stack; for an evening ping
 * dressing tomorrow, it is what was worn today.
 */
export async function findLeftovers(user: User, forDate: string): Promise<Leftover[]> {
  const from = shiftDate(forDate, -LEFTOVER_DAYS);
  const to = shiftDate(forDate, -1);
  const rows = await prisma.outfit.findMany({
    where: { userId: user.id, status: "worn", date: { gte: from, lte: to } },
    select: { id: true, date: true, itemIds: true, decisionsJson: true },
  });
  const pending = undecidedPieces(
    rows.map((row) => ({
      id: row.id,
      date: row.date,
      itemIds: JSON.parse(row.itemIds) as string[],
      decisions: parseDecisions(row.decisionsJson),
    })),
    { from, to },
  );
  if (!pending.length) return [];

  // Shoes are worn but never laundered, so nobody is asked to make a call on them.
  const items = await prisma.item.findMany({
    where: {
      id: { in: pending.map((row) => row.itemId) },
      userId: user.id,
      status: "available",
      NOT: { category: "shoes" },
    },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  return pending
    .map((row) => ({ outfitId: row.outfitId, item: byId.get(row.itemId) }))
    .filter((row): row is Leftover => Boolean(row.item));
}
