import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { chatModel } from "@/lib/openai";
import { parseStyle } from "@/lib/style";

const shopSchema = z.object({
  suggestions: z.array(
    z.object({
      item: z.string(),
      why: z.string(),
      search: z.string(),
    }),
  ),
});

export async function suggestPurchases(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const items = await prisma.item.findMany({ where: { userId } });
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Add OPENAI_API_KEY to .env");
  }

  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: chatModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Suggest 3 clothing purchases that fill holes in this closet without changing who they are. JSON:
{ "suggestions": [{ "item": string, "why": string, "search": string }] }
search is a shopping query, not a URL. Stay in their lane.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          style: parseStyle(user.styleProfile),
          closet: items.map((item) => ({
            name: item.name,
            category: item.category,
            subcategory: item.subcategory,
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
  return shopSchema.parse(JSON.parse(raw)).suggestions;
}
