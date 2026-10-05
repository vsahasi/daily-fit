export type PingTarget = "today" | "tomorrow";

/** From this local hour on, the ping is an evening one: it dresses tomorrow and asks about today. */
const EVENING_HOUR = 16;

export function pingTarget(sendHour: number): PingTarget {
  return sendHour >= EVENING_HOUR ? "tomorrow" : "today";
}

export function pingTitle(target: PingTarget) {
  return target === "tomorrow" ? "Tomorrow" : "Today";
}

function nameList(names: string[]) {
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 4).join(", ")} and ${names.length - 4} more`;
}

/** One notification carries the look and the hamper question, so the morning is a single tap. */
export function pingBody(opts: { target: PingTarget; reason: string; leftovers: string[] }) {
  if (!opts.leftovers.length) return opts.reason;
  const list = nameList(opts.leftovers);
  const ask =
    opts.target === "tomorrow" ? `You wore ${list}. What's dirty?` : `Still out: ${list}. Wash or keep?`;
  return `${opts.reason}\n${ask}`;
}
