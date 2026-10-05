import type { Item } from "@prisma/client";
import type { DayPlan } from "@/lib/bands";
import { pieceKind, sleeveLength } from "@/lib/kinds";
import type { Recency } from "@/lib/rotation";

/**
 * House rules: the wearer's standing preferences, on top of the canon. Polos are for
 * once in a while, not the default; a tee or a long sleeve is the everyday top. These
 * are soft, so a polo still goes out when it is clearly the best clean look and none
 * has gone out this week.
 */
const POLO_BASE = -6;
/** A polo seen this many days ago or fewer, worn or only shown, holds the next one back. */
const POLO_REST_DAYS = 3;
const POLO_REST = -8;
const LONG_SLEEVE_BONUS = 3;

/** He has turned down a polo over shorts every time it was offered. */
const POLO_ON_SHORTS = -25;
/** A button-up on an ordinary day is the engine reaching for filler. */
const SHIRT_ON_A_PLAIN_DAY = -4;
const LONG_SHIRT_ON_A_PLAIN_DAY = -12;
/** A football shirt is for match day, not for class. */
const JERSEY_ON_A_PLAIN_DAY = -20;
/** Dri-Fit is for the gym, not the lecture hall. */
const ATHLETIC_TEE = -6;

export function houseScore(top: Item, plan: DayPlan, recency?: Recency, bottom?: Item) {
  const reasons: string[] = [];
  let score = 0;
  if (pieceKind(top) === "athletic tee") score += ATHLETIC_TEE;
  if (pieceKind(top) === "jersey") score += JERSEY_ON_A_PLAIN_DAY;
  if (pieceKind(top) === "shirt") score += sleeveLength(top) === "long" ? LONG_SHIRT_ON_A_PLAIN_DAY : SHIRT_ON_A_PLAIN_DAY;
  if (pieceKind(top) === "polo") {
    score += POLO_BASE;
    if (bottom && ["short", "athletic short"].includes(pieceKind(bottom))) score += POLO_ON_SHORTS;
    const seen = recency?.pieceKindSeen["top:polo"];
    if (seen != null && seen <= POLO_REST_DAYS) score += POLO_REST;
  } else if (plan.sleeves === "any" && sleeveLength(top) === "long") {
    score += LONG_SLEEVE_BONUS;
    reasons.push("A long sleeve for the cool day");
  }
  return { score, reasons };
}
