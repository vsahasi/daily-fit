"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { saveLocationFromCity, saveLocationFromCoords } from "@/app/actions";

type WhereYouAreProps = {
  city: string | null;
  variant?: "full" | "quiet";
};

export function WhereYouAre({ city, variant = "full" }: WhereYouAreProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(!city);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  async function locateDevice() {
    if (!navigator.geolocation) {
      setStatus("This browser cannot share location. Type a city instead.");
      return;
    }
    setBusy(true);
    setStatus("Finding you…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const label = await saveLocationFromCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
          setStatus(`Using ${label}`);
          setEditing(false);
          router.refresh();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Could not save that location");
        } finally {
          setBusy(false);
        }
      },
      (error) => {
        setBusy(false);
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("No problem. Type the city instead.");
        } else {
          setStatus("Could not find you. Type the city instead.");
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30 * 60 * 1000 },
    );
  }

  async function submitCity(event: FormEvent) {
    event.preventDefault();
    const cityName = query.trim();
    if (!cityName) return;
    setBusy(true);
    setStatus("Looking it up…");
    try {
      const label = await saveLocationFromCity(cityName);
      setStatus(`Using ${label}`);
      setQuery("");
      setEditing(false);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not find that city");
    } finally {
      setBusy(false);
    }
  }

  if (city && !editing) {
    return (
      <p className={variant === "quiet" ? "text-[13px] text-mute" : "text-[13px]"}>
        {city}
        {" · "}
        <button type="button" className="text-ink underline-offset-2 hover:underline" onClick={() => setEditing(true)}>
          Change
        </button>
      </p>
    );
  }

  return (
    <div className="max-w-md">
      {variant === "full" && !city ? (
        <p className="mb-5 text-[13px] text-mute">
          Weather comes from where you actually are. Share location, or type a city.
        </p>
      ) : null}
      <button type="button" className="btn" disabled={busy} onClick={() => void locateDevice()}>
        {busy && status.startsWith("Finding") ? "Finding you…" : "Use my location"}
      </button>
      <form onSubmit={(event) => void submitCity(event)} className="mt-6">
        <label className="flex flex-col gap-2 text-[12px] text-mute">
          Or type a city
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Seattle, Washington"
            className="field"
            disabled={busy}
          />
        </label>
        <button type="submit" className="btn mt-3" disabled={busy || !query.trim()}>
          Use this city
        </button>
      </form>
      {status ? <p className="mt-3 text-[13px] text-mute">{status}</p> : null}
      {city && editing ? (
        <button
          type="button"
          className="mt-3 text-[13px] text-mute hover:text-ink"
          onClick={() => setEditing(false)}
        >
          Keep {city}
        </button>
      ) : null}
    </div>
  );
}
