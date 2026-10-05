import type { Item } from "@prisma/client";
import { pairKind } from "@/lib/kinds";

/**
 * What "I like this look" adds up to. A like is a nudge toward that shape of look
 * and those pieces, never a rule: the bump is small and capped, so it cannot bring
 * the same stack back before rotation lets it, and it cannot override the weather.
 */
export type Likes = {
  looks: number;
  pairKinds: Record<string, number>;
  pieces: Record<string, number>;
  /** Looks turned down with Not this or Another look, and pieces swapped out of a look. */
  turnedDown: number;
  passedKinds: Record<string, number>;
  passedPieces: Record<string, number>;
};

const PAIR_BUMP = 3;
const PAIR_CAP = 9;
const PIECE_BUMP = 1;
const PIECE_CAP = 3;
const TOTAL_CAP = 12;
const PASS_PAIR_BUMP = 3;
const PASS_PAIR_CAP = 9;
const PASS_PIECE_BUMP = 1;
const PASS_PIECE_CAP = 4;
const PASS_TOTAL_CAP = 12;

export function buildLikes(
  items: Item[],
  liked: string[][],
  turnedDown: string[][] = [],
  swappedOut: string[] = [],
): Likes {
  const byId = new Map(items.map((item) => [item.id, item]));
  const likes: Likes = { looks: 0, pairKinds: {}, pieces: {}, turnedDown: 0, passedKinds: {}, passedPieces: {} };
  const piecesOf = (ids: string[]) => ids.map((id) => byId.get(id)).filter((item): item is Item => Boolean(item));
  for (const ids of liked) {
    const pieces = piecesOf(ids);
    if (pieces.length < 2) continue;
    likes.looks += 1;
    const kind = pairKind(pieces);
    if (kind) likes.pairKinds[kind] = (likes.pairKinds[kind] ?? 0) + 1;
    for (const piece of pieces) {
      if (piece.category === "shoes") continue;
      likes.pieces[piece.id] = (likes.pieces[piece.id] ?? 0) + 1;
    }
  }
  for (const ids of turnedDown) {
    const pieces = piecesOf(ids);
    if (pieces.length < 2) continue;
    likes.turnedDown += 1;
    const kind = pairKind(pieces);
    if (kind) likes.passedKinds[kind] = (likes.passedKinds[kind] ?? 0) + 1;
    for (const piece of pieces) {
      if (piece.category === "shoes") continue;
      likes.passedPieces[piece.id] = (likes.passedPieces[piece.id] ?? 0) + 1;
    }
  }
  for (const id of swappedOut) {
    if (!byId.has(id)) continue;
    likes.turnedDown += 1;
    likes.passedPieces[id] = (likes.passedPieces[id] ?? 0) + 1;
  }
  return likes;
}

export function likeScore(pieces: Item[], likes?: Likes) {
  if (!likes || (!likes.looks && !likes.turnedDown)) return { score: 0, reasons: [] as string[] };
  const reasons: string[] = [];
  const kind = pairKind(pieces);

  let up = 0;
  const kindLikes = kind ? likes.pairKinds[kind] ?? 0 : 0;
  if (kindLikes) {
    up += Math.min(PAIR_CAP, kindLikes * PAIR_BUMP);
    reasons.push("A kind of pairing you have liked");
  }
  for (const piece of pieces) {
    up += Math.min(PIECE_CAP, (likes.pieces[piece.id] ?? 0) * PIECE_BUMP);
  }

  let down = 0;
  const kindPasses = kind ? likes.passedKinds[kind] ?? 0 : 0;
  if (kindPasses) {
    down += Math.min(PASS_PAIR_CAP, kindPasses * PASS_PAIR_BUMP);
    if (kindPasses >= 3) reasons.push("A kind of pairing you keep turning down");
  }
  for (const piece of pieces) {
    down += Math.min(PASS_PIECE_CAP, (likes.passedPieces[piece.id] ?? 0) * PASS_PIECE_BUMP);
  }

  return { score: Math.min(TOTAL_CAP, up) - Math.min(PASS_TOTAL_CAP, down), reasons };
}
