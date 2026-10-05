import type { DayFeel, Weather } from "@/lib/types";

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
    results?: { name: string; admin1?: string; country: string; latitude: number; longitude: number; timezone?: string }[];
  };
  const hit = data.results?.[0];
  if (!hit) {
    throw new Error("No matching city");
  }

  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  // The zone travels with the place: the forecast hours and "today" are read in it.
  return { latitude: hit.latitude, longitude: hit.longitude, label, timezone: hit.timezone };
}

/** The IANA zone at a point, from the forecast service. Null when it cannot be read. */
export async function zoneForCoords(latitude: number, longitude: number) {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("daily", "weather_code");
    url.searchParams.set("forecast_days", "1");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const zone = ((await res.json()) as { timezone?: string }).timezone;
    return zone && validZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

export function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The name of the place at a point. The forecast service has no reverse lookup, so this
 * asks OpenStreetMap first and a second service if that fails. A failure only costs the label.
 */
export async function reverseGeocode(latitude: number, longitude: number) {
  const fallback = { latitude, longitude, label: "Current location" };
  const join = (parts: (string | undefined)[]) => parts.filter(Boolean).join(", ");
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "10");
    url.searchParams.set("accept-language", "en");
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "daily-fit/1.0 (personal closet app)" }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = (await res.json()) as { address?: { city?: string; town?: string; village?: string; suburb?: string; state?: string; country?: string } };
      const place = data.address?.city ?? data.address?.town ?? data.address?.village ?? data.address?.suburb;
      if (place) return { latitude, longitude, label: join([place, data.address?.state, data.address?.country]) };
    }
  } catch {
    /* try the second service */
  }
  try {
    const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("localityLanguage", "en");
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = (await res.json()) as { locality?: string; city?: string; principalSubdivision?: string; countryName?: string };
      const place = data.locality || data.city;
      if (place) return { latitude, longitude, label: join([place, data.principalSubdivision, data.countryName]) };
    }
  } catch {
    /* the label is not worth failing for */
  }
  return fallback;
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
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,apparent_temperature_max,apparent_temperature_min,wind_speed_10m_max,sunshine_duration,daylight_duration",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,wind_speed_10m,sunshine_duration,weather_code,precipitation_probability,precipitation",
  );
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");

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
      apparent_temperature_max?: number[];
      apparent_temperature_min?: number[];
      wind_speed_10m_max?: number[];
      sunshine_duration?: number[];
      daylight_duration?: number[];
    };
    hourly?: Hourly;
  };

  const date = opts.date ? opts.date.slice(0, 10) : data.daily.time[0];
  const found = data.daily.time.indexOf(date);
  if (found < 0) throw new Error(`No forecast for ${date} yet`);
  const day = found;
  const code = data.daily.weather_code[day] ?? 0;
  const feelsMax = data.daily.apparent_temperature_max?.[day];
  const feelsMin = data.daily.apparent_temperature_min?.[day];
  const windMax = data.daily.wind_speed_10m_max?.[day];
  const out = hoursOut(data.hourly, data.daily.time[day]);
  const sunFrac =
    data.daily.sunshine_duration?.[day] != null && data.daily.daylight_duration?.[day]
      ? data.daily.sunshine_duration[day] / data.daily.daylight_duration[day]
      : undefined;
  const feel = data.hourly ? dayFeel(data.hourly, data.daily.time[day], sunFrac) : undefined;
  return {
    date: data.daily.time[day],
    tempMin: Math.round(data.daily.temperature_2m_min[day]),
    tempMax: Math.round(data.daily.temperature_2m_max[day]),
    precipProb: data.daily.precipitation_probability_max[day] ?? 0,
    code,
    summary: WEATHER_CODES[code] ?? "mixed",
    locationLabel: opts.locationLabel,
    ...(feelsMax != null ? { feelsMax: Math.round(feelsMax) } : {}),
    ...(feelsMin != null ? { feelsMin: Math.round(feelsMin) } : {}),
    ...(windMax != null ? { windMax: Math.round(windMax) } : {}),
    ...out,
    ...(feel ? { feel } : {}),
  };
}

export type Hourly = {
  time: string[];
  temperature_2m?: number[];
  apparent_temperature?: number[];
  wind_speed_10m?: number[];
  sunshine_duration?: number[];
  weather_code?: number[];
  precipitation_probability?: number[];
  precipitation?: number[];
};

const FOG = new Set([45, 48]);
const DRIZZLE = new Set([51, 53, 55, 56, 57]);
const RAIN = new Set([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const HEAVY = new Set([63, 65, 82, 95, 96, 99]);
/** Wind takes this much off the felt temperature per mph (Steadman), at any temperature. */
const WIND_COST = 0.42;
/** Full sun after mid-morning adds this much; fog takes it away. */
const SUN_BONUS = 5;
const SUN_FROM_HOUR = 10;

/**
 * The day read hour by hour over the hours out. Air temperature is kept honest; the
 * effective number takes off wind and fog and adds sun, and never trusts the API's
 * humidity-warmed apparent temperature on a foggy morning.
 */
export function dayFeel(hourly: Hourly, date: string, sunFracDaily?: number): DayFeel | undefined {
  const rows: { hour: number; temp: number; eff: number; code: number; pop: number; wet: boolean; wind: number }[] = [];
  let dawn: number | undefined;
  hourly.time.forEach((stamp, i) => {
    if (!stamp.startsWith(date)) return;
    const hour = Number(stamp.slice(11, 13));
    const temp = hourly.temperature_2m?.[i];
    if (temp == null || Number.isNaN(hour)) return;
    const wind = hourly.wind_speed_10m?.[i] ?? 0;
    const code = hourly.weather_code?.[i] ?? 0;
    const sunny = (hourly.sunshine_duration?.[i] ?? 0) >= 1800 && hour >= SUN_FROM_HOUR;
    const sun = FOG.has(code) ? -SUN_BONUS : sunny ? SUN_BONUS : 0;
    const eff = temp - WIND_COST * wind + sun;
    if (hour === OUT_FROM) dawn = temp;
    if (hour < OUT_FROM || hour > OUT_TO) return;
    const pop = hourly.precipitation_probability?.[i] ?? 0;
    const wet = (hourly.precipitation?.[i] ?? 0) >= 0.1 || DRIZZLE.has(code) || RAIN.has(code);
    rows.push({ hour, temp, eff, code, pop, wet, wind });
  });
  if (!rows.length) return undefined;
  const high = Math.max(...rows.map((row) => row.temp));
  const low = Math.min(...rows.map((row) => row.temp));
  const lowEff = Math.min(...rows.map((row) => row.eff));
  const evening = rows.filter((row) => row.hour >= 19).map((row) => row.eff);
  const codes = rows.map((row) => row.code);
  const sunnyHours = rows.filter((row) => row.hour >= SUN_FROM_HOUR && (hourly.sunshine_duration?.[hourly.time.indexOf(`${date}T${String(row.hour).padStart(2, "0")}:00`)] ?? 0) >= 1800).length;
  const sunFrac = sunFracDaily ?? sunnyHours / Math.max(1, rows.filter((row) => row.hour >= SUN_FROM_HOUR).length);
  return {
    high: Math.round(high),
    low: Math.round(low),
    lowEff: Math.round(lowEff),
    dawn: Math.round(dawn ?? low),
    swing: Math.round(high - (dawn ?? low)),
    coolHours: rows.filter((row) => row.eff < 60).length,
    eveningEff: Math.round(evening.length ? Math.min(...evening) : lowEff),
    windMax: Math.round(Math.max(...rows.map((row) => row.wind))),
    sunFrac: Math.round(Math.min(1, Math.max(0, sunFrac)) * 100) / 100,
    popOut: Math.max(...rows.map((row) => row.pop)),
    precipHours: rows.filter((row) => row.wet).length,
    drizzle: codes.some((code) => DRIZZLE.has(code)),
    rain: codes.some((code) => RAIN.has(code)),
    heavyRain: codes.some((code) => HEAVY.has(code)),
    fog: codes.some((code) => FOG.has(code)),
    fogPastNoon: rows.some((row) => row.hour >= 12 && FOG.has(row.code)),
  };
}

/**
 * The same read from daily numbers alone, for looks stored before the hourly read
 * existed and for tests. Coarse on purpose: a daily low is colder than any hour out.
 */
export function feelFromDaily(weather: Weather): DayFeel {
  const code = weather.code;
  const sunFrac = code <= 1 ? 0.9 : code === 2 ? 0.6 : FOG.has(code) ? 0.3 : code === 3 ? 0.25 : 0.1;
  const dawn = weather.tempMin + 2;
  const wind = weather.windMax ?? 0;
  const lowEff = dawn - WIND_COST * wind - (FOG.has(code) ? SUN_BONUS : 0);
  return {
    high: weather.tempMax,
    low: dawn,
    lowEff: Math.round(lowEff),
    dawn,
    swing: weather.tempMax - dawn,
    coolHours: lowEff < 55 ? 3 : lowEff < 60 ? 2 : 0,
    eveningEff: Math.round((weather.tempMax + dawn) / 2 - 2),
    windMax: wind,
    sunFrac,
    popOut: weather.precipProb,
    precipHours: weather.precipProb >= 50 ? 2 : 0,
    drizzle: DRIZZLE.has(code),
    rain: RAIN.has(code),
    heavyRain: HEAVY.has(code),
    fog: FOG.has(code),
    fogPastNoon: false,
  };
}

/** First and last hour of the day a person is counted as out, inclusive. */
export const OUT_FROM = 8;
export const OUT_TO = 20;
const MORNING_HOUR = 9;

/**
 * The feels-like range for the hours a person is out, plus the 9am walk-out number.
 * A 71° afternoon after a 53° dawn is really a 56° morning and a 69° afternoon.
 */
export function hoursOut(
  hourly: Hourly | undefined,
  date: string,
): { outHigh?: number; outLow?: number; morning?: number } {
  if (!hourly?.apparent_temperature) return {};
  const temps: number[] = [];
  let morning: number | undefined;
  const apparent = hourly.apparent_temperature;
  hourly.time.forEach((stamp, i) => {
    if (!stamp.startsWith(date)) return;
    const hour = Number(stamp.slice(11, 13));
    const value = apparent[i];
    if (value == null || Number.isNaN(hour)) return;
    if (hour >= OUT_FROM && hour <= OUT_TO) temps.push(value);
    if (hour === MORNING_HOUR) morning = value;
  });
  if (!temps.length) return {};
  return {
    outHigh: Math.round(Math.max(...temps)),
    outLow: Math.round(Math.min(...temps)),
    ...(morning != null ? { morning: Math.round(morning) } : {}),
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
  const morning = weather.feel?.dawn ?? weather.morning;
  const swing = morning != null && weather.tempMax - morning >= 12 ? `, ${morning}° at 8am` : "";
  const wind = (weather.feel?.windMax ?? weather.windMax ?? 0) >= 15 ? ` Wind to ${weather.feel?.windMax ?? weather.windMax} mph.` : "";
  return `${weather.tempMax}° in ${weather.locationLabel}${swing}. ${summary}.${rain}${wind}`;
}
