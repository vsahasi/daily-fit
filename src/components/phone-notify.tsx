"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { savePushSubscription } from "@/app/actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function isIos() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as { standalone?: boolean }).standalone)
  );
}

function notificationApi() {
  return "Notification" in window ? window.Notification : undefined;
}

type Status = "wait" | "off" | "on" | "home" | "blocked" | "busy";

/** What this browser can do right now. Only meaningful on the client. */
function detect(): Status {
  if (isIos() && !isStandalone()) return "home";
  const Notify = notificationApi();
  if (!Notify || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return isIos() ? "home" : "blocked";
  }
  if (Notify.permission === "granted") return "on";
  if (Notify.permission === "denied") return "blocked";
  return "off";
}

const neverChanges = () => () => undefined;
const onServer = (): Status => "wait";

export function PhoneNotify() {
  // The server renders nothing; the browser's answer is read after hydration.
  const detected = useSyncExternalStore(neverChanges, detect, onServer);
  const [changed, setStatus] = useState<Status | null>(null);
  const status = changed ?? detected;
  const [message, setMessage] = useState("");

  // Permission can outlive the subscription: iOS drops it, or the server clears a dead one.
  // When the browser still holds one, hand it back to the server; when it does not, offer the button again.
  useEffect(() => {
    if (detected !== "on") return;
    let live = true;
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!live) return;
        const json = subscription?.toJSON();
        if (json?.endpoint && json.keys?.p256dh && json.keys?.auth) {
          await savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
        } else {
          setStatus("off");
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [detected]);

  async function enable() {
    const Notify = notificationApi();
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!Notify || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("home");
      return;
    }
    if (!key) {
      setMessage("Notifications are not configured.");
      return;
    }
    setStatus("busy");
    try {
      const permission = await Notify.requestPermission();
      if (permission !== "granted") {
        setStatus("blocked");
        setMessage("Notifications are blocked for this site.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setStatus("blocked");
        setMessage("This browser would not create a notification subscription.");
        return;
      }
      await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      setStatus("on");
      setMessage("This phone will get the look.");
    } catch (error) {
      setStatus(isIos() && !isStandalone() ? "home" : "blocked");
      setMessage(error instanceof Error ? error.message : "Could not turn on notifications.");
    }
  }

  if (status === "wait") {
    return null;
  }

  if (status === "home") {
    return (
      <p className="mt-2 max-w-[42ch] text-[13px] text-mute">
        On iPhone: tap Share, Add to Home Screen, open Daily Fit from that icon, then come back here.
        Safari in the browser tab cannot send notifications.
      </p>
    );
  }

  if (status === "on") {
    return <p className="mt-2 text-[13px] text-mute">{message || "Notifications are on for this phone."}</p>;
  }

  if (status === "blocked") {
    return (
      <p className="mt-2 max-w-[42ch] text-[13px] text-mute">
        {message || "This browser cannot send notifications. On iPhone, add Daily Fit to the Home Screen first."}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <button type="button" className="btn btn-ghost" disabled={status === "busy"} onClick={enable}>
        {status === "busy" ? "Turning on" : "Allow notifications"}
      </button>
      {message ? <p className="mt-2 text-[13px] text-warn">{message}</p> : null}
    </div>
  );
}
