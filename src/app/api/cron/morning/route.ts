import { NextRequest } from "next/server";
import { hourInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { sendLookPing, sendShopPing, shopPingDue } from "@/lib/morning";

/**
 * Runs hourly. Each user gets the look at the local hour they chose in Account, and on
 * Sundays, a few hours later, one piece worth adding to the closet.
 */
async function run() {
  const users = await prisma.user.findMany();
  const results = [];
  for (const user of users) {
    let hour = -1;
    try {
      hour = hourInZone(user.timezone);
    } catch {
      results.push({ userId: user.id, kind: "look", sent: false, error: "bad timezone" });
      continue;
    }
    if (hour === user.sendHour) {
      try {
        const result = await sendLookPing(user);
        results.push({ userId: user.id, kind: "look", ...result, error: null });
      } catch (error) {
        results.push({
          userId: user.id,
          kind: "look",
          sent: false,
          error: error instanceof Error ? error.message : "failed",
        });
      }
    }
    if (shopPingDue(user)) {
      try {
        const result = await sendShopPing(user);
        results.push({ userId: user.id, kind: "shop", ...result, error: null });
      } catch (error) {
        results.push({
          userId: user.id,
          kind: "shop",
          sent: false,
          error: error instanceof Error ? error.message : "failed",
        });
      }
    }
  }
  return results;
}

function authorized(request: NextRequest) {
  const header = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await run();
  return Response.json({ ok: true, results });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
