import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import { chatModel } from "@/lib/openai";
import type { CatalogedItem } from "@/lib/types";

const boolish = z.union([z.boolean(), z.string(), z.number()]).transform((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["false", "no", "0", "none", ""].includes(value.trim().toLowerCase());
});

const level = z.union([z.number(), z.string()]).transform((value) => {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
});

const catalogSchema = z.object({
  name: z.string(),
  category: z.string().transform((value) => {
    const category = value.toLowerCase();
    if (category.includes("shoe")) return "shoes";
    if (/(bottom|pant|short|chino|jean|skirt)/.test(category)) return "bottom";
    if (/(outer|jacket|coat|hoodie|shell|parka)/.test(category)) return "outer";
    if (/(access|hat|belt|bag|watch|jewel)/.test(category)) return "accessory";
    return "top";
  }),
  subcategory: z.string(),
  colors: z.array(z.string()).min(1),
  material: z.string(),
  pattern: z.string(),
  formality: level,
  warmth: level,
  rainOk: boolish,
  notes: z.string(),
  fit: z.string(),
  silhouette: z.string(),
  layerRole: z
    .string()
    .transform((value) => {
      const role = value.toLowerCase();
      if (role === "base" || role === "mid" || role === "shell" || role === "bottom" || role === "shoe" || role === "extra") {
        return role;
      }
      return "extra";
    }),
  colorFamilies: z.array(z.string()).min(1),
  pairsWith: z.array(z.string()).min(1),
  avoidWith: z.array(z.string()).optional().default([]),
  occasions: z.array(z.string()).min(1),
  stretch: boolish,
  patternScale: z
    .string()
    .transform((value) => {
      const scale = value.toLowerCase();
      if (scale === "small" || scale === "large" || scale === "none") return scale;
      return "none";
    }),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  rotation: z
    .union([z.number(), z.string()])
    .optional()
    .transform((value) => {
      const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
      if (n === 90 || n === 180 || n === 270) return n;
      return 0;
    }),
});

function client() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Add OPENAI_API_KEY to .env so photos can be cataloged");
  }
  return new OpenAI({ apiKey: key });
}

export async function catalogPhotoBytes(bytes: Buffer): Promise<CatalogedItem> {
  const jpeg = await sharp(bytes)
    .rotate()
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const b64 = jpeg.toString("base64");
  const openai = client();

  const completion = await openai.chat.completions.create({
    model: chatModel(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You catalog one garment from a photo for a personal closet. Return JSON:
name: silhouette + colorway ("Navy Henley", "Sand Stripe Short"). No invented first names. Brand only if printed.
category: top|bottom|outer|shoes|accessory
subcategory: henley, polo, jersey, tee, chino, work pant, linen pant, sweatpant, short, hoodie, jacket, etc
colors: visible color names
material: cloth as worn ("cotton jersey", "nylon Dri-Fit", "linen blend")
pattern: solid, stripe, logo, etc
formality 1-5 (1 gym/house, 2 campus/errands, 3 everyday, 4 a nice polo or tailored pant you would not wear to class every day, 5 event/formal)
A logo jersey or Dri-Fit is 1-2. A crisp polo, dress shirt, or suiting is 4-5. Do not mark everything a 3.
warmth 1-5 (1 tank/short, 5 heavy coat)
rainOk
notes: one sentence on how it wears
fit: slim, regular, relaxed, oversized, cropped, athletic
silhouette: the cut name
layerRole: base|mid|shell|bottom|shoe|extra
colorFamilies: coarse families from {white, cream, grey, black, navy, blue, khaki, sand, olive, green, red, burgundy, yellow, gold, brown, pink, purple}
pairsWith: 3-6 concrete pairing notes grounded in menswear (e.g. "navy athletic tee with khaki chino or grey sweatpant", "stripe short with white or navy knit, not another loud print")
avoidWith: clashes (two logos, two loud patterns, shorts in a coat look)
occasions: from {gym, campus, weekend, evening, travel, house, beach}. A crisp polo, dress shirt, or suiting also belongs on evening. Athletic Dri-Fit and jerseys are gym. Linen shorts and tees can be beach.
stretch
patternScale: none|small|large
bbox: [x, y, w, h] as 0-1 fractions of the image covering ONLY the garment, tight but not cropping fabric. Ignore bed, floor, hangers, feet.
Be specific. Do not invent brands you cannot see.
SHORTS VS PANTS: if the hem ends at or above the knee, subcategory is short, never chino or pant. Full-length to the ankle is a pant.
SLEEVES: if the sleeve ends above the elbow, it is short-sleeve. Only say long-sleeve if the cuff reaches the wrist.
Read printed text (Real Madrid, Mexico, Harker, Nike, Dri-FIT) and put it in the name.
Dri-FIT / performance polyester is not cotton knit.
rotation: 0, 90, 180, or 270. Degrees clockwise so the garment is upright (collar or waistband at the top).`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Catalog this garment." },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${b64}` },
          },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Could not read that photo");
  }
  const parsed = catalogSchema.parse(JSON.parse(raw));
  const rotation = parsed.rotation ?? 0;
  const bbox = parsed.bbox.map((n) => Math.min(1, Math.max(0, n))) as [number, number, number, number];
  if (bbox[2] < 0.15 || bbox[3] < 0.15) {
    return { ...parsed, bbox: [0.08, 0.08, 0.84, 0.84], rotation };
  }
  return { ...parsed, bbox, rotation };
}
