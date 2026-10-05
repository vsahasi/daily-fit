import type { Weather } from "@/lib/types";

const WEATHER_CODES: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "foggy",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  80: "rain showers",
  81: "rain showers",
  82: "heavy showers",
  95: "thunderstorms",
};

export async function geocodeCity(query: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Could not look up that city");
  }

  const data = (await res.json()) as {
    results?: { name: string; admin1?: string; country: string; latitude: number; longitude: number }[];
  };
  const hit = data.results?.[0];
  if (!hit) {
    throw new Error("No matching city");
  }

  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  return { latitude: hit.latitude, longitude: hit.longitude, label };
}

export async function reverseGeocode(latitude: number, longitude: number) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return { latitude, longitude, label: "Current location" };
  }

  const data = (await res.json()) as {
    results?: { name?: string; admin1?: string; country?: string }[];
  };
  const hit = data.results?.[0];
  const label = hit?.name
    ? [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ")
    : "Current location";
  return { latitude, longitude, label };
}

export async function fetchWeather(opts: {
  latitude: number;
  longitude: number;
  timezone: string;
  locationLabel: string;
  /** Local YYYY-MM-DD to forecast. Defaults to today; an evening ping asks for tomorrow. */
  date?: string;
}): Promise<Weather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(opts.latitude));
  url.searchParams.set("longitude", String(opts.longitude));
  url.searchParams.set("timezone", opts.timezone);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("temperature_unit", "fahrenheit");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Weather lookup failed");
  }

  const data = (await res.json()) as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
      weather_code: number[];
    };
  };

  const day = Math.max(0, opts.date ? data.daily.time.indexOf(opts.date.slice(0, 10)) : 0);
  const code = data.daily.weather_code[day] ?? 0;
  return {
    date: data.daily.time[day],
    tempMin: Math.round(data.daily.temperature_2m_min[day]),
    tempMax: Math.round(data.daily.temperature_2m_max[day]),
    precipProb: data.daily.precipitation_probability_max[day] ?? 0,
    code,
    summary: WEATHER_CODES[code] ?? "mixed",
    locationLabel: opts.locationLabel,
  };
}

export function weatherLine(weather: Weather, opts?: { includePlace?: boolean }) {
  const rain =
    weather.precipProb >= 40 ? `, ${weather.precipProb}% chance of rain` : "";
  const place =
    opts?.includePlace === false ? "" : ` in ${weather.locationLabel}`;
  return `${weather.tempMax}° / ${weather.tempMin}° and ${weather.summary}${place}${rain}`;
}

export function weatherDek(weather: Weather) {
  const summary = weather.summary.charAt(0).toUpperCase() + weather.summary.slice(1);
  const rain = weather.precipProb >= 40 ? " Rain is likely." : "";
  return `${weather.tempMax}° in ${weather.locationLabel}. ${summary}.${rain}`;
}
