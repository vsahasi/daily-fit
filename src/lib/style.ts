import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { chatModel } from "@/lib/openai";
import { buildTaste } from "@/lib/taste";
import type { StyleProfile } from "@/lib/types";
import { wearHistory } from "@/lib/wear";

const strings = z.union([z.array(z.string()), z.record(z.string(), z.string())]).transform((value) =>
  Array.isArray(value) ? value : Object.values(value),
);

const styleSchema = z.object({
  summary: z.string(),
  palette: strings,
  silhouettes: strings,
  do: strings,
  dont: strings,
  formality: z.union([z.string(), z.record(z.string(), z.string())]).transform((value) =>
    typeof value === "string" ? value : Object.values(value).join(". "),
  ),
});

export function parseStyle(json: string | null): StyleProfile | null {
  if (!json) return null;
  try {
    return styleSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}

export async function refreshStyle(userId: string) {
  const items = await prisma.item.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (items.length === 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { styleSummary: null, styleProfile: null, styleUpdatedAt: new Date() },
    });
    return null;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Add OPENAI_API_KEY to .env to infer style");
  }

  const openai = new OpenAI({ apiKey: key });
  const wardrobe = items.map((item) => ({
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    colors: JSON.parse(item.colors) as string[],
    material: item.material,
    formality: item.formality,
    fit: item.fit,
    pairsWith: JSON.parse(item.pairsWith || "[]") as string[],
  }));

  const votes = await prisma.lookVote.findMany({ where: { userId } });
  // Only the worn and skipped signals matter here, so the reference date is not important.
  const history = await wearHistory(userId, new Date().toISOString().slice(0, 10));
  const taste = buildTaste(items, votes, history.signals);

  const completion = await openai.chat.completions.create({
    model: chatModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Infer a sticky personal style from this closet AND from like/pass votes on real combinations.
JSON with these exact types:
summary: string, 2-3 concrete sentences grounded in the votes when present
palette: string[] of dominant colors they actually like wearing together
silhouettes: string[]
do: string[] how to dress this person, from the likes
dont: string[] what they pass on
formality: one string describing the range they actually wear, not just own
Do not make them trendier than the clothes. If votes say tees and cargos, say tees and cargos. Do not talk yourself into linen and polos because the closet owns them.`,
      },
      { role: "user", content: JSON.stringify({
        wardrobe,
        looks: {
          votes: taste.votes,
          likes: taste.likes,
          passes: taste.passes,
          assumptions: taste.assumptions,
          pairings: taste.pairRate,
          pieces: taste.kindRate,
        },
      }) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Style inference failed");
  }
  const profile = styleSchema.parse(JSON.parse(raw));

  await prisma.user.update({
    where: { id: userId },
    data: {
      styleSummary: profile.summary,
      styleProfile: JSON.stringify(profile),
      styleUpdatedAt: new Date(),
    },
  });

  return profile;
}
