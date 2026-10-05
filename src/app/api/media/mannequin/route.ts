import { NextRequest } from "next/server";
import { renderMannequin } from "@/lib/mannequin";
import { comboKeyFromIds } from "@/lib/pair";
import { downloadBytes, mannequinStorageKey } from "@/lib/storage";
import { getCurrentUser } from "@/lib/user";

export const maxDuration = 120;

function idsFrom(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const ids = idsFrom(request);
  if (ids.length < 2) return new Response("Not found", { status: 404 });
  try {
    const bytes = await downloadBytes(mannequinStorageKey(user.id, comboKeyFromIds(ids)));
    return new Response(bytes, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const body = (await request.json()) as { itemIds?: string[] };
  const itemIds = (body.itemIds ?? []).filter(Boolean);
  if (itemIds.length < 2) {
    return Response.json({ error: "Need a top and a bottom" }, { status: 400 });
  }
  await renderMannequin(user.id, itemIds);
  return Response.json({ ok: true, ids: itemIds.join(",") });
}
