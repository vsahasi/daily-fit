import type { Item, LookVote } from "@prisma/client";
import { comboKeyFromIds, type LookPref } from "@/lib/pair";

export function prefsFromVotes(votes: LookVote[]): LookPref {
  const liked: string[][] = [];
  const passed: string[][] = [];
  for (const vote of votes) {
    const ids = JSON.parse(vote.itemIds) as string[];
    if (vote.verdict === "like") liked.push(ids);
    else passed.push(ids);
  }
  return { liked, passed };
}

export function votedKeys(votes: LookVote[]) {
  return votes.map((vote) => vote.comboKey);
}

export function piecesForLook(items: Item[], ids: string[]) {
  return ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is Item => Boolean(item));
}

export function lookKey(ids: string[]) {
  return comboKeyFromIds(ids);
}
