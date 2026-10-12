import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shiftDate, todayInZone } from "@/lib/dates";
import { buildLikes } from "@/lib/likes";
import { comboKeyFromIds, pickLook, swapPiece } from "@/lib/pair";
import { prefsFromVotes } from "@/lib/prefs";
import { everydayOccasion, occasionFromWeatherJson, type Occasion } from "@/lib/occasion";
import { MAX_DAYS_AHEAD } from "@/lib/scenario";
import type { Weather } from "@/lib/types";
import { lookForDate, wearHistory } from "@/lib/wear";
import { fetchWeather, geocodeCity } from "@/lib/weather";

type Spot = { latitude: number; longitude: number; timezone: string; locationLabel: string };

/**
 * The forecast a look is read against: home on the day asked for, or for an event, the
 * place and the day the line named. A place that cannot be found is dressed at home.
 */
async function forecastFor(home: Spot, event: Occasion, day: string): Promise<Weather> {
  let spot = home;
  let base = day;
  if (event.place) {
    try {
      const geo = await geocodeCity(event.place);
      spot = { latitude: geo.latitude, longitude: geo.longitude, timezone: geo.timezone ?? home.timezone, locationLabel: geo.label };
      base = todayInZone(spot.timezone);
    } catch {
      /* an unknown place is dressed at home */
    }
  }
  const ahead = Math.min(event.dayOffset ?? 0, MAX_DAYS_AHEAD);
  return fetchWeather({ ...spot, date: ahead > 0 ? shiftDate(base, ahead) : base });
}

/**
 * The look for a day, made on first ask. A suggestion that has since lost a piece to the
 * wash is replaced quietly: that is not a pass, so it must not count against the stack.
 */
export async function ensureLook(user: User, day: string) {
  const current = await lookForDate(user.id, day);
  if (current?.status === "suggested") {
    const ids = JSON.parse(current.itemIds) as string[];
    const clean = await prisma.item.count({
      where: { id: { in: ids }, userId: user.id, status: "available" },
    });
    if (clean < ids.length) {
      // "replaced", not "skipped": a piece going to the wash is not a turn-down.
      await prisma.outfit.update({ where: { id: current.id }, data: { status: "replaced" } });
      try {
        return await generateOutfit(user, false, undefined, day);
      } catch (error) {
        await prisma.outfit.update({ where: { id: current.id }, data: { status: "suggested" } });
        throw error;
      }
    }
  }
  return current ?? generateOutfit(user, false, undefined, day);
}

/**
 * Picks the look for a day. `forDate` defaults to today in the user's zone; an evening
 * ping passes tomorrow. A look already confirmed as worn is never replaced.
 */
export async function generateOutfit(
  user: User,
  force = false,
  occasion?: Occasion,
  forDate?: string,
) {
  const event = occasion ?? everydayOccasion();
  const isEvent = event.label !== "everyday";
  const day = forDate ?? todayInZone(user.timezone);
  const date = isEvent ? `${day}:event` : day;
  const status = isEvent ? "event" : "suggested";

  // Nothing is written until the new look exists: a failed forecast or an exhausted
  // closet must never cost the user the look they already have.
  const existing = isEvent ? null : await lookForDate(user.id, day);
  if (existing && (existing.status === "worn" || !force)) {
    return existing;
  }

  if (user.latitude == null || user.longitude == null || !user.locationLabel) {
    throw new Error("Set a city in Account, or send location from the iPhone Shortcut");
  }

  const weather = await forecastFor(
    { latitude: user.latitude, longitude: user.longitude, timezone: user.timezone, locationLabel: user.locationLabel },
    event,
    day,
  );

  // An everyday "Another look" reads only everyday turn-downs; an event reads its own day's event looks.
  const earlier = await prisma.outfit.findMany({
    where: isEvent
      ? { userId: user.id, date, status: { in: ["skipped", "event"] } }
      : { userId: user.id, date: day, status: "skipped" },
  });
  const turnedDown = [...earlier.map((row) => JSON.parse(row.itemIds) as string[]), ...(existing ? [JSON.parse(existing.itemIds) as string[]] : [])];
  const skippedCombos = turnedDown.map((ids) => comboKeyFromIds(ids));
  const avoidItems = isEvent ? [] : turnedDown.flat();

  const [items, votes, history] = await Promise.all([
    prisma.item.findMany({ where: { userId: user.id, NOT: { imagePath: "" } } }),
    prisma.lookVote.findMany({ where: { userId: user.id } }),
    wearHistory(user.id, day),
  ]);
  const pref = prefsFromVotes(votes);
  // Likes are read against the whole closet, so a liked look still counts while a piece of it is in the wash.
  const likes = buildLikes(items, pref.liked, history.turnedDown.map((row) => row.itemIds), history.swappedOut);
  const shared = { items, weather, occasion: event, dateKey: `${date}:${event.label}`, pref, likes, recency: history.recency };

  let pick;
  try {
    pick = pickLook({ ...shared, skippedCombos, avoidItems });
  } catch (error) {
    // Every stack has been turned down today. Start the round again rather than leave no look.
    if (!turnedDown.length) throw error;
    // Only the look on screen stays out, so the round never hands it straight back.
    const live = existing ?? earlier.find((row) => row.status === "event");
    pick = pickLook({ ...shared, skippedCombos: live ? [comboKeyFromIds(JSON.parse(live.itemIds) as string[])] : [], avoidItems: [] });
  }

  // Two requests can reach this point together (a reload, the cron and a page open, a double tap).
  // A lock per user and day lets one through at a time; the second sees what the first wrote.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.id}:${date}`}))`;
    if (!isEvent) {
      const rows = await tx.outfit.findMany({
        where: { userId: user.id, date: day, status: { in: ["worn", "suggested"] } },
        orderBy: { createdAt: "desc" },
      });
      const now = rows.find((row) => row.status === "worn") ?? rows[0] ?? null;
      // Someone else already made today's look, or already replaced the one this request was turning down.
      if (now && now.id !== existing?.id) return now;
      if (existing) await tx.outfit.update({ where: { id: existing.id }, data: { status: "skipped" } });
    } else {
      await tx.outfit.updateMany({ where: { userId: user.id, date, status: "event" }, data: { status: "skipped" } });
    }
    return tx.outfit.create({
      data: {
        userId: user.id,
        date,
        itemIds: JSON.stringify(pick.itemIds),
        weatherJson: JSON.stringify({ ...weather, scenario: event.label, occasion: event }),
        reason: pick.reason,
        status,
      },
    });
  });
}

/**
 * Trades one piece of today's look for another clean piece in that slot. The old look is
 * kept as "swapped": it was seen, so it will not come straight back, but it was not turned
 * down as a whole, so its other pieces stay in play.
 */
export async function swapOutfitPiece(user: User, outfitId: string, itemId: string) {
  const outfit = await prisma.outfit.findFirst({
    where: { id: outfitId, userId: user.id, status: { in: ["suggested", "event"] } },
  });
  if (!outfit) throw new Error("That look is gone. Make a new one.");
  const current = JSON.parse(outfit.itemIds) as string[];
  const weather = JSON.parse(outfit.weatherJson) as Weather;
  const occasion = occasionFromWeatherJson(outfit.weatherJson) ?? everydayOccasion();
  const day = outfit.date.slice(0, 10);

  const [items, votes, history, earlier] = await Promise.all([
    prisma.item.findMany({ where: { userId: user.id, NOT: { imagePath: "" } } }),
    prisma.lookVote.findMany({ where: { userId: user.id } }),
    wearHistory(user.id, day),
    prisma.outfit.findMany({
      where: { userId: user.id, date: outfit.date, status: { in: ["swapped", "skipped"] } },
      select: { itemIds: true },
    }),
  ]);
  const leaving = items.find((item) => item.id === itemId);
  if (!leaving) throw new Error("That piece is not in this look");
  // Every piece already tried in this slot today is out, so each swap is a new answer.
  const sameSlot = (item: { category: string } | undefined) =>
    item != null && (item.category === leaving.category || (leaving.category !== "bottom" && leaving.category !== "shoes" && (item.category === "outer" || item.category === "top")));
  const avoidItems = earlier
    .flatMap((row) => JSON.parse(row.itemIds) as string[])
    .filter((id) => sameSlot(items.find((item) => item.id === id)));
  const pref = prefsFromVotes(votes);
  const likes = buildLikes(items, pref.liked, history.turnedDown.map((row) => row.itemIds), history.swappedOut);

  const pick = swapPiece({
    items,
    weather,
    occasion,
    dateKey: `${outfit.date}:${occasion.label}`,
    current,
    itemId,
    avoidItems,
    pref,
    likes,
    recency: history.recency,
  });

  const [, created] = await prisma.$transaction([
    prisma.outfit.update({ where: { id: outfit.id }, data: { status: "swapped" } }),
    prisma.outfit.create({
      data: {
        userId: user.id,
        date: outfit.date,
        itemIds: JSON.stringify(pick.itemIds),
        weatherJson: outfit.weatherJson,
        reason: pick.reason,
        status: outfit.status,
      },
    }),
  ]);
  return created;
}
