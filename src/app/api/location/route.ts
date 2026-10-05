import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { reverseGeocode } from "@/lib/weather";

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
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json({ error: "need latitude and longitude" }, { status: 400 });
  }

  const geo = await reverseGeocode(latitude, longitude);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      latitude,
      longitude,
      locationLabel: geo.label,
      locationUpdatedAt: new Date(),
    },
  });

  return Response.json({ ok: true, locationLabel: geo.label });
}
