"use server";

import type { User } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth";
import { shiftDate, todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ingestPhoto } from "@/lib/ingest";
import { finishLaundry, markClean, putInWash } from "@/lib/laundry";
import { sendEventPing, sendLookPing } from "@/lib/morning";
import { generateOutfit, swapOutfitPiece } from "@/lib/outfit";
import { occasionFromWeatherJson } from "@/lib/occasion";
import { comboKeyFromIds } from "@/lib/pair";
import { dismissIdea, suggestPurchases } from "@/lib/shop";
import { readScenario } from "@/lib/scenario";
import { refreshStyle } from "@/lib/style";
import { getCurrentUser, revalidateUser } from "@/lib/user";
import { deleteObject } from "@/lib/storage";
import { decidePiece, lookForDate, unwearOutfit, wearOutfit } from "@/lib/wear";
import { geocodeCity, reverseGeocode, validZone } from "@/lib/weather";

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
  await refreshStyle(user.id).catch(() => undefined);
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

/**
 * The look the user is acting on must be the one on their screen. A page left open
 * overnight, or a second tab, sends an old id: then nothing changes but the page.
 */
/** The day a form belongs to: today, or tomorrow when it came from the evening preview. */
function formDay(timezone: string, formData?: FormData) {
  const today = todayInZone(timezone);
  return formData?.get("day") === "tomorrow" ? shiftDate(today, 1) : today;
}

function backTo(formData?: FormData) {
  return formData?.get("day") === "tomorrow" ? "/today?day=tomorrow&" : "/today?";
}

async function currentLook(userId: string, timezone: string, formData?: FormData) {
  const outfit = await lookForDate(userId, formDay(timezone, formData));
  const seen = formData ? String(formData.get("outfitId") ?? "") : "";
  if (!outfit || (seen && seen !== outfit.id)) return null;
  return outfit;
}

/** "Another look" and "Not this": the current look is turned down and a new one made. A failure keeps the current look. */
export async function makeTodayOutfit(formData?: FormData) {
  const user = await getCurrentUser();
  const seen = formData ? String(formData.get("outfitId") ?? "") : "";
  const day = formDay(user.timezone, formData);
  const outfit = await lookForDate(user.id, day);
  let note = "";
  if (!seen || !outfit || seen === outfit.id) {
    await generateOutfit(user, true, undefined, day).catch((error) => {
      note = /clean top/.test(String(error)) ? "That is every look that is clean today." : "Could not make another look just now. Try again in a minute.";
    });
  }
  revalidatePath("/today");
  if (note) redirect(`${backTo(formData)}note=${encodeURIComponent(note)}`);
}

export async function skipTodayOutfit(formData?: FormData) {
  return makeTodayOutfit(formData);
}

/**
 * The brief for a typed line. The same line sent again ("Not this", or the form sent
 * twice) reuses the brief already read for it, so one round of looks answers one brief.
 */
async function eventBrief(user: User, scenario: string) {
  const current = await prisma.outfit.findFirst({
    where: { userId: user.id, date: `${todayInZone(user.timezone)}:event`, status: "event" },
    orderBy: { createdAt: "desc" },
  });
  const stored = current ? occasionFromWeatherJson(current.weatherJson) : null;
  if (stored && stored.label === scenario) return stored;
  return readScenario(scenario, { today: todayInZone(user.timezone), timezone: user.timezone, home: user.locationLabel ?? "" });
}

/** "Dress me for this" and "Not this": a look for the line typed. A failure keeps the current look and says why. */
async function dressEvent(scenario: string) {
  const user = await getCurrentUser();
  const brief = await eventBrief(user, scenario);
  let note = "";
  await generateOutfit(user, false, brief).catch((error) => {
    const message = error instanceof Error ? error.message : "";
    note = /clean top/.test(message)
      ? "That is every look that is clean for this."
      : /Set a city|No forecast/.test(message)
        ? message
        : "Could not dress that just now. Try again in a minute.";
  });
  revalidatePath("/event");
  if (note) redirect(`/event?note=${encodeURIComponent(note)}`);
}

export async function dressForEvent(formData: FormData) {
  const scenario = String(formData.get("scenario") ?? "").trim();
  if (!scenario) {
    throw new Error("Say what you’re dressing for");
  }
  await dressEvent(scenario);
}

export async function skipEventOutfit(formData: FormData) {
  const scenario = String(formData.get("scenario") ?? "").trim();
  if (scenario) await dressEvent(scenario);
  else revalidatePath("/event");
}

function revalidateCloset() {
  revalidatePath("/today");
  revalidatePath("/wash");
  revalidatePath("/");
}

/** "Wearing this": the confirmation that rotation is built on. */
export async function wearTodayOutfit(formData?: FormData) {
  const user = await getCurrentUser();
  // Only today's look can be worn; tomorrow's is a preview.
  const outfit = formData?.get("day") === "tomorrow" ? null : await currentLook(user.id, user.timezone, formData);
  if (outfit) await wearOutfit(user, outfit.id);
  revalidateCloset();
}

export async function unwearTodayOutfit(formData?: FormData) {
  const user = await getCurrentUser();
  const outfit = await currentLook(user.id, user.timezone, formData);
  if (outfit && outfit.status === "worn") await unwearOutfit(user, outfit.id);
  revalidateCloset();
}

/** Swap: one piece of today's look for another clean piece in that slot. */
export async function swapTodayPiece(formData: FormData) {
  const user = await getCurrentUser();
  const itemId = String(formData.get("itemId") ?? "");
  const outfit = itemId ? await currentLook(user.id, user.timezone, formData) : null;
  if (outfit && outfit.status === "suggested") {
    // Nothing else clean for that slot leaves the look as it is.
    let note = "";
    await swapOutfitPiece(user, outfit.id, itemId).catch((error) => {
      note = error instanceof Error && /Nothing else clean/.test(error.message) ? `${error.message}.` : "Could not swap that just now.";
    });
    revalidatePath("/today");
    if (note) redirect(`${backTo(formData)}note=${encodeURIComponent(note)}`);
  }
  revalidatePath("/today");
}

/**
 * "I like this look": a nudge toward this kind of pairing and these pieces. It is not
 * a request to see the same stack again; rotation still holds it back.
 */
export async function likeTodayOutfit(formData?: FormData) {
  const user = await getCurrentUser();
  const outfit = await currentLook(user.id, user.timezone, formData);
  if (!outfit) {
    revalidatePath("/today");
    return;
  }
  const ids = JSON.parse(outfit.itemIds) as string[];
  if (ids.length < 2) return;
  await prisma.lookVote.upsert({
    where: { userId_comboKey: { userId: user.id, comboKey: comboKeyFromIds(ids) } },
    create: {
      userId: user.id,
      comboKey: comboKeyFromIds(ids),
      itemIds: JSON.stringify(ids),
      verdict: "like",
      scenario: "today",
    },
    update: { verdict: "like", scenario: "today" },
  });
  revalidateCloset();
  revalidatePath("/style");
}

export async function unlikeTodayOutfit(formData?: FormData) {
  const user = await getCurrentUser();
  const outfit = await currentLook(user.id, user.timezone, formData);
  if (!outfit) {
    revalidatePath("/today");
    return;
  }
  const ids = JSON.parse(outfit.itemIds) as string[];
  await prisma.lookVote.deleteMany({
    where: { userId: user.id, comboKey: comboKeyFromIds(ids), verdict: "like" },
  });
  revalidateCloset();
  revalidatePath("/style");
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
  await refreshStyle(user.id).catch(() => undefined);
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
      ...(geo.timezone ? { timezone: geo.timezone } : {}),
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      timezone,
      sendHour: formData.get("sendHour") && Number.isFinite(sendHour) ? Math.min(23, Math.max(0, Math.round(sendHour))) : user.sendHour,
      washDays: Number.isFinite(washDays) ? Math.min(14, Math.max(1, Math.round(washDays))) : 2,
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
      timezone: input.timezone && validZone(input.timezone) ? input.timezone : user.timezone,
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
      ...(geo.timezone ? { timezone: geo.timezone } : {}),
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
  // The deck manages its own stack and Today is rendered fresh on every visit: nothing to
  // revalidate, and doing so would re-render the deck and put a voted card back on top.
}

export async function refreshShopIdeas() {
  const user = await getCurrentUser();
  let note = "";
  const before = await prisma.suggestion.count({ where: { userId: user.id } });
  await suggestPurchases(user.id).catch(() => {
    note = "Could not look for new pieces just now. Try again in a minute.";
  });
  if (!note && before === (await prisma.suggestion.count({ where: { userId: user.id } })) && before === 0) {
    note = "Nothing to add right now: the closet covers every gap, or you have waved those ideas off.";
  }
  revalidatePath("/shop");
  revalidatePath("/");
  revalidatePath("/today");
  if (note) redirect(`/shop?note=${encodeURIComponent(note)}`);
}

export async function dismissShopIdea(formData: FormData) {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await dismissIdea(user.id, id);
  revalidatePath("/shop");
  revalidatePath("/");
  revalidatePath("/today");
}

export async function signOut() {
  await clearSessionCookie();
  redirect("/sign-in");
}
