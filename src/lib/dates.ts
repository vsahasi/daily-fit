export function todayInZone(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function utcMidnight(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Calendar math on a YYYY-MM-DD string. A trailing suffix such as ":event" is ignored. */
export function shiftDate(date: string, days: number) {
  return new Date(utcMidnight(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string) {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / 86_400_000);
}

export function yesterdayInZone(timeZone: string, date = new Date()) {
  return shiftDate(todayInZone(timeZone, date), -1);
}

export function tomorrowInZone(timeZone: string, date = new Date()) {
  return shiftDate(todayInZone(timeZone, date), 1);
}

export function hourInZone(timeZone: string, date = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(date);
  const parsed = Number.parseInt(hour, 10);
  return parsed === 24 ? 0 : parsed;
}

/** 0 is Sunday, 6 is Saturday, in the given zone. */
export function weekdayInZone(timeZone: string, date = new Date()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
