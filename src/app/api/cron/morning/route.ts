import { NextRequest } from "next/server";
import { hourInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { sendLookPing } from "@/lib/morning";

/** Runs hourly. Each user gets one ping, at the local hour they chose in Account. */
async function run() {
  const users = await prisma.user.findMany();
  const results = [];
  for (const user of users) {
    if (hourInZone(user.timezone) !== user.sendHour) {
      continue;
    }
    try {
      const result = await sendLookPing(user);
      results.push({ userId: user.id, ...result, error: null });
    } catch (error) {
      results.push({
        userId: user.id,
        sent: false,
        error: error instanceof Error ? error.message : "failed",
      });
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
