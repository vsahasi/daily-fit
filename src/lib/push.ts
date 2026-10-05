import webpush from "web-push";
import type { User } from "@prisma/client";

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

function setup() {
  if (!configured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

export function hasPushSubscription(user: User) {
  return Boolean(user.pushEndpoint && user.pushP256dh && user.pushAuth);
}

export async function sendLookPush(
  user: User,
  opts: { title: string; body: string; url?: string },
) {
  if (!hasPushSubscription(user)) {
    return { sent: false, reason: "Turn on notifications on this phone first" };
  }
  if (!setup()) {
    return { sent: false, reason: "Notifications are not configured" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: user.pushEndpoint!,
        keys: { p256dh: user.pushP256dh!, auth: user.pushAuth! },
      },
      JSON.stringify({
        title: opts.title,
        body: opts.body,
        url: opts.url ?? "/today",
      }),
    );
    return { sent: true, reason: null as string | null };
  } catch (error) {
    const status = Number((error as { statusCode?: number }).statusCode);
    if (status === 404 || status === 410) {
      return { sent: false, reason: "Turn on notifications on this phone again" };
    }
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Could not send that notification",
    };
  }
}
