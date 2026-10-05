import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { todayInZone } from "@/lib/dates";
import { pingBody } from "@/lib/ping";
import type { Weather } from "@/lib/types";
import { findLeftovers, lookForDate } from "@/lib/wear";

/** For an iPhone Shortcut: today's look plus any wash-or-keep leftovers, as notification text. */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!secret) {
    return Response.json({ error: "missing secret" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { shortcutSecret: secret } });
  if (!user) {
    return Response.json({ error: "unknown shortcut" }, { status: 404 });
  }

  const today = todayInZone(user.timezone);
  const outfit = await lookForDate(user.id, today);
  if (!outfit) {
    return Response.json({ title: "Daily Fit", body: "No look yet. Open the site." });
  }

  const leftovers = await findLeftovers(user, today);
  const weather = JSON.parse(outfit.weatherJson) as Weather;
  return Response.json({
    title: weather.locationLabel || "Today",
    body: pingBody({
      target: "today",
      reason: outfit.reason,
      leftovers: leftovers.map((row) => row.item.name),
    }),
  });
}
