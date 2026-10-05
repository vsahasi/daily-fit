import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shiftDate, todayInZone } from "@/lib/dates";
import { ensureLook } from "@/lib/outfit";
import { pingBody, pingTarget, pingTitle, type PingTarget } from "@/lib/ping";
import { sendLookPush } from "@/lib/push";
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
    url: "/today",
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
