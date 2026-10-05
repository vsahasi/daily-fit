import { revalidateTag } from "next/cache";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { reverseGeocode, zoneForCoords } from "@/lib/weather";

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!secret) {
    return Response.json({ error: "missing secret" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { shortcutSecret: secret } });
  if (!user) {
    return Response.json({ error: "unknown shortcut" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const latitude = Number(body.latitude ?? body.lat);
  const longitude = Number(body.longitude ?? body.lng ?? body.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return Response.json({ error: "need latitude and longitude" }, { status: 400 });
  }

  // The zone travels with the place: "today" and the forecast hours are read in it.
  const [geo, timezone] = await Promise.all([reverseGeocode(latitude, longitude), zoneForCoords(latitude, longitude)]);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      latitude,
      longitude,
      locationLabel: geo.label,
      locationUpdatedAt: new Date(),
      ...(timezone ? { timezone } : {}),
    },
  });
  // The signed-in pages read a cached user; without this the next look is dressed for the old place.
  revalidateTag(`user-${user.id}`, "max");

  return Response.json({ ok: true, locationLabel: geo.label, timezone: timezone ?? user.timezone });
}
