import type { Item, LookVote } from "@prisma/client";

/** A look from Today: confirmed as worn, or turned down with Not this / Another look. */
export type WearSignal = { itemIds: string[]; verdict: "worn" | "skipped" };

/** Putting a look on says more than a swipe. Turning one down on a given morning says less. */
const WORN_WEIGHT = 2;
const SKIP_WEIGHT = 0.5;

export type Taste = {
  /** Every signal read: swipes plus looks worn or skipped on Today. */
  votes: number;
  /** Swipe likes and passes on Looks. */
  likes: number;
  passes: number;
  /** Looks confirmed as worn. */
  worn: number;
  baseline: number;
  itemRate: Record<string, number>;
  kindRate: Record<string, number>;
  pairRate: Record<string, number>;
  assumptions: string[];
};

function hay(item: Item) {
  return `${item.subcategory ?? ""} ${item.silhouette ?? ""} ${item.name}`.toLowerCase();
}

export function pieceKind(item: Item) {
  const text = hay(item);
  if (item.category === "bottom") {
    if (text.includes("short")) return "short";
    if (/sweat|jogg/.test(text)) return "sweatpant";
    if (/cargo/.test(text)) return "cargo pant";
    if (/chino/.test(text)) return "chino";
    if (/linen/.test(text)) return "linen pant";
    if (/dress/.test(text)) return "dress pant";
    if (/work|carpenter/.test(text)) return "work pant";
    return item.subcategory || "bottom";
  }
  if (item.category === "top" || item.category === "outer") {
    if (/jersey/.test(text)) return "jersey";
    if (/polo/.test(text)) return "polo";
    if (/henley/.test(text)) return "henley";
    if (/hoodie/.test(text)) return "hoodie";
    if (/sweater|quarter-zip/.test(text)) return "sweater";
    if (/oxford|button/.test(text)) return "shirt";
    if (/tee|t-shirt/.test(text)) return "tee";
    return item.subcategory || "top";
  }
  return item.category;
}

export function pairKind(items: Item[]) {
  const top = items.find((item) => item.category === "top") ?? items.find((item) => item.category === "outer");
  const bottom = items.find((item) => item.category === "bottom");
  if (!top || !bottom) return "";
  return `${pieceKind(top)} + ${pieceKind(bottom)}`;
}

function rate(like: number, pass: number, min: number) {
  const tot = like + pass;
  if (tot < min) return null;
  return like / tot;
}

export function buildTaste(items: Item[], votes: LookVote[], wears: WearSignal[] = []): Taste {
  const byId = new Map(items.map((item) => [item.id, item]));
  const piecesFor = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));

  const swipes = votes
    .map((vote) => ({
      verdict: vote.verdict === "like" ? ("like" as const) : ("pass" as const),
      weight: 1,
      pieces: piecesFor(JSON.parse(vote.itemIds) as string[]),
    }))
    .filter((row) => row.pieces.length >= 2);
  const lived = wears
    .map((wear) => ({
      verdict: wear.verdict === "worn" ? ("like" as const) : ("pass" as const),
      weight: wear.verdict === "worn" ? WORN_WEIGHT : SKIP_WEIGHT,
      pieces: piecesFor(wear.itemIds),
    }))
    .filter((row) => row.pieces.length >= 2);
  const looks = [...swipes, ...lived];

  const likes = swipes.filter((row) => row.verdict === "like").length;
  const passes = swipes.filter((row) => row.verdict === "pass").length;
  const worn = lived.filter((row) => row.verdict === "like").length;
  const likeWeight = looks.reduce((sum, row) => sum + (row.verdict === "like" ? row.weight : 0), 0);
  const totalWeight = looks.reduce((sum, row) => sum + row.weight, 0);
  const baseline = totalWeight ? likeWeight / totalWeight : 0.5;

  const itemStats = new Map<string, { like: number; pass: number }>();
  const kindStats = new Map<string, { like: number; pass: number }>();
  const pairStats = new Map<string, { like: number; pass: number }>();

  for (const row of looks) {
    const bump = (map: Map<string, { like: number; pass: number }>, key: string) => {
      const stat = map.get(key) ?? { like: 0, pass: 0 };
      if (row.verdict === "like") stat.like += row.weight;
      else stat.pass += row.weight;
      map.set(key, stat);
    };
    for (const piece of row.pieces) {
      bump(itemStats, piece.id);
      bump(kindStats, pieceKind(piece));
    }
    const pair = pairKind(row.pieces);
    if (pair) bump(pairStats, pair);
  }

  const itemRate: Record<string, number> = {};
  for (const [id, stat] of itemStats) {
    const value = rate(stat.like, stat.pass, 8);
    if (value != null) itemRate[id] = value;
  }
  const kindRate: Record<string, number> = {};
  for (const [kind, stat] of kindStats) {
    const value = rate(stat.like, stat.pass, 10);
    if (value != null) kindRate[kind] = value;
  }
  const pairRate: Record<string, number> = {};
  for (const [pair, stat] of pairStats) {
    const value = rate(stat.like, stat.pass, 6);
    if (value != null) pairRate[pair] = value;
  }

  return {
    votes: looks.length,
    likes,
    passes,
    worn,
    baseline,
    itemRate,
    kindRate,
    pairRate,
    assumptions: writeAssumptions({ likes: likes + worn, passes, kindRate, pairRate }),
  };
}

function writeAssumptions(input: {
  likes: number;
  passes: number;
  kindRate: Record<string, number>;
  pairRate: Record<string, number>;
}) {
  const lines: string[] = [];
  const pairs = Object.entries(input.pairRate).sort((a, b) => b[1] - a[1]);
  const loved = pairs.filter(([, rate]) => rate >= 0.75).slice(0, 3);
  const hated = pairs.filter(([, rate]) => rate <= 0.3).sort((a, b) => a[1] - b[1]).slice(0, 3);

  if (loved[0]) {
    lines.push(`The combination you keep choosing is ${loved[0][0]}.`);
  }
  for (const [pair] of loved.slice(1)) {
    lines.push(`${cap(pair)} also lands.`);
  }
  if ((input.kindRate["cargo pant"] ?? 0) >= 0.7) {
    lines.push("Cargo and work pants beat chino shorts as the everyday bottom.");
  }
  if ((input.kindRate.tee ?? 0) >= 0.7) {
    lines.push("A tee is the top that actually gets worn.");
  }
  if ((input.kindRate.polo ?? 1) < 0.45 && (input.kindRate.sweater ?? 1) <= 0.4) {
    lines.push("Polos and textured knits lose more days than they win.");
  }
  if ((input.pairRate["polo + short"] ?? 1) <= 0.3 || (input.pairRate["henley + short"] ?? 1) <= 0.3) {
    lines.push("A collar or a henley with shorts gets passed. Shorts want a tee.");
  }
  if ((input.kindRate.sweater ?? 1) <= 0.35) {
    lines.push("The short-sleeve sweater and other knits that read as a tunic are out.");
  }
  if ((input.kindRate.shirt ?? 1) <= 0.4) {
    lines.push("Button-ups stay for dinner and interviews, not the weekday stack.");
  }
  if ((input.kindRate.hoodie ?? 1) <= 0.45) {
    lines.push("A hoodie as the only top is a pass more often than a like.");
  }
  if ((input.kindRate.jersey ?? 0) >= 0.5 && (input.pairRate["jersey + cargo pant"] ?? 0) >= 0.65) {
    lines.push("Jerseys and Dri-Fit are fine off the field if the bottom is cargo or a work pant.");
  }
  for (const [pair] of hated) {
    lines.push(`${cap(pair)} is a miss.`);
  }
  if (!lines.length && input.likes + input.passes > 0) {
    lines.push("Still reading the likes. Keep swiping.");
  }
  return lines.slice(0, 8);
}

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function scoreTaste(items: Item[], taste?: Taste) {
  if (!taste || taste.votes < 20) return { score: 0, reasons: [] as string[] };
  const reasons: string[] = [];
  let score = 0;
  const pair = pairKind(items);
  if (pair && taste.pairRate[pair] != null) {
    const delta = taste.pairRate[pair] - taste.baseline;
    score += delta * 48;
    if (delta >= 0.15) reasons.push("A pairing you keep liking");
    if (delta <= -0.2) reasons.push("A pairing you usually pass");
  }
  const pieceScores = items
    .map((item) => taste.itemRate[item.id])
    .filter((value): value is number => value != null);
  if (pieceScores.length) {
    const avg = pieceScores.reduce((sum, n) => sum + n, 0) / pieceScores.length;
    score += (avg - taste.baseline) * 22;
  }
  const kinds = items.map(pieceKind);
  for (const kind of kinds) {
    if (taste.kindRate[kind] == null) continue;
    score += (taste.kindRate[kind] - taste.baseline) * 10;
  }
  return { score, reasons };
}

export function tasteReady(taste?: Taste) {
  return Boolean(taste && taste.votes >= 20);
}
