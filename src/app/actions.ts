"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth";
import { todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ingestPhoto } from "@/lib/ingest";
import { finishLaundry, markClean, putInWash } from "@/lib/laundry";
import { sendEventPing, sendLookPing } from "@/lib/morning";
import { generateOutfit } from "@/lib/outfit";
import { parseOccasion } from "@/lib/occasion";
import { comboKeyFromIds } from "@/lib/pair";
import { suggestPurchases } from "@/lib/shop";
import { refreshStyle } from "@/lib/style";
import { getCurrentUser, revalidateUser } from "@/lib/user";
import { deleteObject } from "@/lib/storage";
import { decidePiece, lookForDate, unwearOutfit, wearOutfit } from "@/lib/wear";
import { geocodeCity, reverseGeocode } from "@/lib/weather";

export async function uploadOne(formData: FormData) {
  const user = await getCurrentUser();
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    throw new Error("Choose a photo");
  }
  const bytes = Buffer.from(await photo.arrayBuffer());
  await ingestPhoto({ userId: user.id, bytes, mime: photo.type || photo.name, source: "web" });
  revalidatePath("/");
}

export async function deleteItem(itemId: string) {
  const user = await getCurrentUser();
  const item = await prisma.item.findFirst({ where: { id: itemId, userId: user.id } });
  if (!item) return;
  if (item.imagePath) {
    await deleteObject(item.imagePath).catch(() => undefined);
  }
  await prisma.item.delete({ where: { id: item.id } });
  await refreshStyle(user.id);
  revalidatePath("/");
}

export async function putItemInWash(formData: FormData) {
  const user = await getCurrentUser();
  const itemId = String(formData.get("itemId") ?? "");
  const raw = formData.get("days");
  const days = raw == null ? user.washDays : Number(raw);
  if (!itemId) return;
  await putInWash(user.id, itemId, days);
  revalidatePath("/");
  revalidatePath("/wash");
  revalidatePath("/today");
}

export async function markItemClean(itemId: string) {
  const user = await getCurrentUser();
  await markClean(user.id, itemId);
  revalidatePath("/");
  revalidatePath("/wash");
  revalidatePath("/today");
}

export async function didLaundry() {
  const user = await getCurrentUser();
  await finishLaundry(user.id);
  revalidatePath("/wash");
  revalidatePath("/");
  revalidatePath("/today");
}

export async function makeTodayOutfit() {
  const user = await getCurrentUser();
  await generateOutfit(user, true);
  revalidatePath("/today");
}

export async function skipTodayOutfit() {
  const user = await getCurrentUser();
  await prisma.outfit.updateMany({
    where: { userId: user.id, date: todayInZone(user.timezone), status: "suggested" },
    data: { status: "skipped" },
  });
  await generateOutfit(user);
  revalidatePath("/today");
}

export async function dressForEvent(formData: FormData) {
  const user = await getCurrentUser();
  const scenario = String(formData.get("scenario") ?? "").trim();
  if (!scenario) {
    throw new Error("Say what you’re dressing for");
  }
  await generateOutfit(user, false, parseOccasion(scenario));
  revalidatePath("/event");
}

export async function skipEventOutfit(formData: FormData) {
  const user = await getCurrentUser();
  const scenario = String(formData.get("scenario") ?? "").trim();
  if (scenario) {
    await generateOutfit(user, false, parseOccasion(scenario));
  }
  revalidatePath("/event");
}

function revalidateCloset() {
  revalidatePath("/today");
  revalidatePath("/wash");
  revalidatePath("/");
}

/** "Wearing this": the confirmation that rotation and taste are built on. */
export async function wearTodayOutfit() {
  const user = await getCurrentUser();
  const outfit = await lookForDate(user.id, todayInZone(user.timezone));
  if (!outfit) return;
  await wearOutfit(user, outfit.id);
  revalidateCloset();
}

export async function unwearTodayOutfit() {
  const user = await getCurrentUser();
  const outfit = await lookForDate(user.id, todayInZone(user.timezone));
  if (!outfit || outfit.status !== "worn") return;
  await unwearOutfit(user, outfit.id);
  revalidateCloset();
}

/** Wash or still good, for one piece of a look that was worn. */
export async function decideWornPiece(formData: FormData) {
  const user = await getCurrentUser();
  const outfitId = String(formData.get("outfitId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const choice = String(formData.get("choice") ?? "");
  if (!outfitId || !itemId || (choice !== "wash" && choice !== "keep")) return;
  await decidePiece(user, outfitId, itemId, choice);
  revalidateCloset();
}

export async function sendTodayToPhone() {
  try {
    const user = await getCurrentUser();
    const result = await sendLookPing(user, { target: "today" });
    revalidatePath("/today");
    if (!result.sent) {
      return { ok: false, message: result.reason ?? "Could not send that look" };
    }
    return { ok: true, message: "On this phone." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not send that look" };
  }
}

export async function sendEventToPhone() {
  try {
    const user = await getCurrentUser();
    const result = await sendEventPing(user);
    revalidatePath("/event");
    if (!result.sent) {
      return { ok: false, message: result.reason ?? "Could not send that look" };
    }
    return { ok: true, message: "On this phone." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not send that look" };
  }
}

export async function refreshMyStyle() {
  const user = await getCurrentUser();
  await refreshStyle(user.id);
  revalidatePath("/style");
}

export async function saveSettings(formData: FormData) {
  const user = await getCurrentUser();
  const city = String(formData.get("city") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? user.timezone).trim();
  const sendHour = Number(formData.get("sendHour") ?? user.sendHour);
  const washDays = Number(formData.get("washDays") ?? user.washDays);

  let location = {};
  if (city) {
    const geo = await geocodeCity(city);
    location = {
      latitude: geo.latitude,
      longitude: geo.longitude,
      locationLabel: geo.label,
      locationUpdatedAt: new Date(),
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      timezone,
      sendHour: Number.isFinite(sendHour) ? sendHour : 7,
      washDays: Number.isFinite(washDays) ? washDays : 2,
      ...location,
    },
  });

  revalidateUser(user.id);
  revalidatePath("/settings");
  revalidatePath("/today");
  revalidatePath("/");
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const user = await getCurrentUser();
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { ok: false };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      pushEndpoint: input.endpoint,
      pushP256dh: input.p256dh,
      pushAuth: input.auth,
    },
  });
  revalidateUser(user.id);
  return { ok: true };
}

export async function saveLocationFromCoords(input: {
  latitude: number;
  longitude: number;
  timezone?: string;
}) {
  const user = await getCurrentUser();
  const geo = await reverseGeocode(input.latitude, input.longitude);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      latitude: geo.latitude,
      longitude: geo.longitude,
      locationLabel: geo.label,
      locationUpdatedAt: new Date(),
      timezone: input.timezone || user.timezone,
    },
  });
  revalidateUser(user.id);
  revalidatePath("/today");
  revalidatePath("/settings");
  revalidatePath("/");
  return geo.label;
}

export async function saveLocationFromCity(city: string) {
  const user = await getCurrentUser();
  const geo = await geocodeCity(city);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      latitude: geo.latitude,
      longitude: geo.longitude,
      locationLabel: geo.label,
      locationUpdatedAt: new Date(),
    },
  });
  revalidateUser(user.id);
  revalidatePath("/today");
  revalidatePath("/settings");
  revalidatePath("/");
  return geo.label;
}

export async function voteLook(itemIds: string[], verdict: "like" | "pass", scenario: string) {
  const user = await getCurrentUser();
  const ids = itemIds.filter(Boolean);
  if (ids.length < 2) return;
  await prisma.lookVote.upsert({
    where: { userId_comboKey: { userId: user.id, comboKey: comboKeyFromIds(ids) } },
    create: {
      userId: user.id,
      comboKey: comboKeyFromIds(ids),
      itemIds: JSON.stringify(ids),
      verdict,
      scenario: scenario || "everyday",
    },
    update: { verdict, scenario: scenario || "everyday" },
  });
  revalidatePath("/looks");
  revalidatePath("/today");
  revalidatePath("/event");
}

export async function getShopIdeas() {
  const user = await getCurrentUser();
  return suggestPurchases(user.id);
}

export async function signOut() {
  await clearSessionCookie();
  redirect("/sign-in");
}
