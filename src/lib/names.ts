export function clothName(name: string, material?: string | null) {
  const cloth = material?.trim();
  if (!cloth) return name;
  if (name.toLowerCase().includes(cloth.toLowerCase())) return name;
  return `${name} in ${cloth}`;
}

export function clothWeight(warmth?: number | null) {
  if (warmth == null) return null;
  if (warmth <= 2) return "Light";
  if (warmth >= 4) return "Heavy";
  return "Mid";
}

export function clothFacts(opts: {
  warmth?: number | null;
  inWash?: boolean;
}) {
  if (opts.inWash) return "In the wash";
  return clothWeight(opts.warmth) ?? "";
}

/** Closet card note for a recently worn piece. `days` is whole calendar days since it was worn. */
export function wornAgo(days: number | null | undefined) {
  if (days == null || days < 0 || days > 7) return null;
  if (days === 0) return "Worn today";
  if (days === 1) return "Worn yesterday";
  if (days === 7) return "Worn a week ago";
  return `Worn ${days} days ago`;
}
