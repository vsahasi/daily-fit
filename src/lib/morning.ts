import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hourInZone, shiftDate, todayInZone, weekdayInZone } from "@/lib/dates";
import { ensureLook } from "@/lib/outfit";
import { pingBody, pingTarget, pingTitle, type PingTarget } from "@/lib/ping";
import { hasPushSubscription, sendLookPush } from "@/lib/push";
import { nextIdeaToSend } from "@/lib/shop";
import type { Weather } from "@/lib/types";
import { findLeftovers } from "@/lib/wear";

/**
 * The whole routine in one notification: the look, a wash-or-keep nudge for pieces
 * still out, and a tap that opens Today. The hour in Account decides the mode: a
 * morning hour dresses today, an evening hour dresses tomorrow and asks about today.
 */
export async function sendLookPing(user: User, opts?: { target?: PingTarget }) {
  const target = opts?.target ?? pingTarget(user.sendHour);
  const today = todayInZone(user.timezone);
  const day = target === "tomorrow" ? shiftDate(today, 1) : today;

  const outfit = await ensureLook(user, day);
  const leftovers = await findLeftovers(user, day);

  const push = await sendLookPush(user, {
    title: pingTitle(target),
    body: pingBody({
      target,
      reason: outfit.reason,
      leftovers: leftovers.map((row) => row.item.name),
    }),
    url: target === "tomorrow" ? "/today?day=tomorrow" : "/today",
  });
  return { outfitId: outfit.id, target, sent: push.sent, reason: push.reason };
}

export async function sendEventPing(user: User) {
  const outfit = await prisma.outfit.findFirst({
    where: { userId: user.id, date: `${todayInZone(user.timezone)}:event`, status: "event" },
    orderBy: { createdAt: "desc" },
  });
  if (!outfit) {
    return { outfitId: null, sent: false, reason: "Dress for the event first" };
  }
  const weather = JSON.parse(outfit.weatherJson) as Weather & { scenario?: string };
  const push = await sendLookPush(user, {
    title: `For ${weather.scenario || "this"}`,
    body: outfit.reason,
    url: "/event",
  });
  return { outfitId: outfit.id, sent: push.sent, reason: push.reason };
}

/** Sundays, a few hours after the look, one piece worth adding to the closet. */
const SHOP_DAY = 0;
const SHOP_HOURS_AFTER_LOOK = 4;

export function shopPingDue(user: User, now = new Date()) {
  if (weekdayInZone(user.timezone, now) !== SHOP_DAY) return false;
  // Four hours after a morning look; noon when the look itself comes in the evening.
  const hour = user.sendHour <= 16 ? Math.max(9, user.sendHour + SHOP_HOURS_AFTER_LOOK) : 12;
  if (hourInZone(user.timezone, now) !== hour) return false;
  if (user.shopPingedAt && now.getTime() - user.shopPingedAt.getTime() < 6 * 86_400_000) return false;
  return true;
}

export async function sendShopPing(user: User) {
  if (!hasPushSubscription(user)) return { sent: false, reason: "No phone to send to" };
  const idea = await nextIdeaToSend(user.id);
  if (!idea) return { sent: false, reason: "Nothing to suggest" };
  const push = await sendLookPush(user, {
    title: "Something new for the closet",
    body: `${idea.item}. ${idea.why}`,
    url: "/shop",
  });
  if (push.sent) {
    await prisma.$transaction([
      prisma.suggestion.update({ where: { id: idea.id }, data: { sentAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { shopPingedAt: new Date() } }),
    ]);
  }
  return { sent: push.sent, reason: push.reason, idea: idea.item };
}
