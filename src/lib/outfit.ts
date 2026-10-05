import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todayInZone } from "@/lib/dates";
import { comboKeyFromIds, pickLook } from "@/lib/pair";
import { prefsFromVotes } from "@/lib/prefs";
import { buildTaste } from "@/lib/taste";
import { everydayOccasion, type Occasion } from "@/lib/occasion";
import { lookForDate, wearHistory } from "@/lib/wear";
import { fetchWeather } from "@/lib/weather";

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
      await prisma.outfit.update({ where: { id: current.id }, data: { status: "replaced" } });
      return generateOutfit(user, false, undefined, day);
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

  if (!isEvent) {
    const existing = await lookForDate(user.id, day);
    if (existing && (existing.status === "worn" || !force)) {
      return existing;
    }
    if (existing) {
      await prisma.outfit.update({
        where: { id: existing.id },
        data: { status: "skipped" },
      });
    }
  } else {
    await prisma.outfit.updateMany({
      where: { userId: user.id, date, status: "event" },
      data: { status: "skipped" },
    });
  }

  if (user.latitude == null || user.longitude == null || !user.locationLabel) {
    throw new Error("Set a city in Account, or send location from the iPhone Shortcut");
  }

  const weather = await fetchWeather({
    latitude: user.latitude,
    longitude: user.longitude,
    timezone: user.timezone,
    locationLabel: user.locationLabel,
    date: day,
  });

  const skippedThatDay = await prisma.outfit.findMany({
    where: {
      userId: user.id,
      date: { in: [day, `${day}:event`] },
      status: { in: isEvent ? ["skipped", "event", "suggested"] : ["skipped"] },
    },
  });
  const skippedCombos = skippedThatDay.map((row) => comboKeyFromIds(JSON.parse(row.itemIds) as string[]));

  const [available, votes, history] = await Promise.all([
    prisma.item.findMany({
      where: { userId: user.id, status: "available", NOT: { imagePath: "" } },
    }),
    prisma.lookVote.findMany({ where: { userId: user.id } }),
    wearHistory(user.id, day),
  ]);
  const pref = prefsFromVotes(votes);
  const taste = buildTaste(available, votes, history.signals);

  const pick = pickLook({
    items: available,
    weather,
    skippedCombos,
    occasion: event,
    dateKey: `${date}:${event.label}`,
    pref,
    taste,
    recency: history.recency,
  });

  return prisma.outfit.create({
    data: {
      userId: user.id,
      date,
      itemIds: JSON.stringify(pick.itemIds),
      weatherJson: JSON.stringify({ ...weather, scenario: event.label, occasion: event }),
      reason: pick.reason,
      status,
    },
  });
}
