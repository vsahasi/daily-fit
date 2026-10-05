import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { closetGaps } from "@/lib/gaps";
import { chatModel } from "@/lib/openai";
import { parseStyle } from "@/lib/style";

const shopSchema = z.object({
  suggestions: z.array(
    z.object({
      gap: z.string(),
      item: z.string(),
      why: z.string(),
      search: z.string(),
    }),
  ),
});

/** How long a "Not for me" keeps that gap quiet. */
const DISMISS_WEEKS = 8;

export type Idea = { id: string; gap: string; item: string; why: string; search: string };

/** The ideas on file that have not been waved off, newest first. */
export async function currentIdeas(userId: string, limit = 3): Promise<Idea[]> {
  const [rows, items] = await Promise.all([
    prisma.suggestion.findMany({ where: { userId, dismissedAt: null }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.item.findMany({ where: { userId } }),
  ]);
  // Only gaps that are still open, one idea each, newest first. A piece that has been bought closes its gap.
  const open = new Set(closetGaps(items).map((gap) => gap.key));
  // A "Not for me" quiets its whole gap for a while, not just that one idea.
  const all = await prisma.suggestion.findMany({ where: { userId, dismissedAt: { gt: new Date(Date.now() - DISMISS_WEEKS * 7 * 86_400_000) } }, select: { gap: true } });
  for (const row of all) open.delete(row.gap);
  const seen = new Set<string>();
  const out: Idea[] = [];
  for (const row of rows) {
    if (!open.has(row.gap) || seen.has(row.gap)) continue;
    seen.add(row.gap);
    out.push({ id: row.id, gap: row.gap, item: row.item, why: row.why, search: row.search });
    if (out.length >= limit) break;
  }
  return out;
}



/**
 * Three pieces that would fill real gaps. The gaps come from the closet itself, in code;
 * the model only writes the specific piece and a search query, so it cannot invent a hole.
 */
export async function suggestPurchases(userId: string): Promise<Idea[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const items = await prisma.item.findMany({ where: { userId } });
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Add OPENAI_API_KEY to .env");
  }
  const since = new Date(Date.now() - DISMISS_WEEKS * 7 * 86_400_000);
  const past = await prisma.suggestion.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 60 });
  const dismissed = new Set(past.filter((row) => row.dismissedAt && row.dismissedAt > since).map((row) => row.gap));
  const gaps = closetGaps(items).filter((gap) => !dismissed.has(gap.key)).slice(0, 5);
  if (!gaps.length) return currentIdeas(userId);

  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: chatModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You pick one specific purchase for each gap in a college student's closet in Berkeley, California (foggy 54° mornings, 70° afternoons, wet 50s in winter). Casual: tees, henleys, work pants, cargos, chinos, sneakers. Nothing trendy, nothing that changes who he is. He does not wear leather, suede, or denim: never suggest them, and name canvas, waxed cotton, nylon, corduroy, twill, or a synthetic instead. For each gap, return exactly one piece. JSON:
{ "suggestions": [{ "gap": string (copy the gap key exactly), "item": string (the piece: cut, color, fabric, under 10 words), "why": string (one or two sentences, how it gets worn with pieces he owns, name them), "search": string (a shopping query, not a URL) }] }
Return one suggestion per gap, in the order given. Use the closet list to name what it pairs with.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          style: parseStyle(user.styleProfile)?.summary ?? null,
          gaps: gaps.map((gap) => ({
            key: gap.key,
            missing: gap.label,
            why: gap.why,
            // Already suggested for this gap: offer something different.
            doNotRepeat: past.filter((row) => row.gap === gap.key).map((row) => row.item),
          })),
          closet: items.map((item) => ({
            name: item.name,
            category: item.category,
            colors: JSON.parse(item.colors),
          })),
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Could not suggest pieces");
  }
  const perGap = new Set<string>();
  const parsed = shopSchema
    .parse(JSON.parse(raw))
    .suggestions.filter((row) => gaps.some((gap) => gap.key === row.gap))
    // One idea per gap, so the same gap is never pinged twice.
    .filter((row) => (perGap.has(row.gap) ? false : Boolean(perGap.add(row.gap))));
  if (!parsed.length) throw new Error("Could not suggest pieces");

  // Fresh ideas replace the unsent ones; anything already pinged stays on the record.
  await prisma.$transaction([
    prisma.suggestion.deleteMany({ where: { userId, sentAt: null, dismissedAt: null } }),
    prisma.suggestion.createMany({
      data: parsed.map((row) => ({ userId, gap: row.gap, item: row.item, why: row.why, search: row.search })),
    }),
  ]);
  return currentIdeas(userId, parsed.length);
}

export async function dismissIdea(userId: string, id: string) {
  await prisma.suggestion.updateMany({ where: { id, userId }, data: { dismissedAt: new Date() } });
}

/** The next idea to send: the oldest one never sent, made fresh if there is none. */
export async function nextIdeaToSend(userId: string) {
  const items = await prisma.item.findMany({ where: { userId } });
  const open = new Set(closetGaps(items).map((gap) => gap.key));
  const quiet = await prisma.suggestion.findMany({ where: { userId, dismissedAt: { gt: new Date(Date.now() - DISMISS_WEEKS * 7 * 86_400_000) } }, select: { gap: true } });
  for (const row of quiet) open.delete(row.gap);
  const waiting = async () =>
    (
      await prisma.suggestion.findMany({ where: { userId, sentAt: null, dismissedAt: null }, orderBy: { createdAt: "asc" } })
    ).find((row) => open.has(row.gap)) ?? null;
  const first = await waiting();
  if (first) return first;
  await suggestPurchases(userId);
  return waiting();
}
