import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { imageModel } from "@/lib/openai";
import { comboKeyFromIds } from "@/lib/pair";
import { downloadBytes, mannequinStorageKey, uploadBytes } from "@/lib/storage";

const PROMPT = `Photorealistic clothing-store mannequin dressed in these exact garments.
Male figure, 5 feet 8 inches tall, lightly muscled athletic build, natural standing pose, weight on both feet.
Headless ghost mannequin or a matte display figure with no face, no hair, no skin texture that looks like a real person.
The clothes must match the reference photos: colors, logos, text, cut, sleeve length, and fabric.
Garments are filled out, smooth, wrinkle-free, as on an e-commerce product page (SSENSE, Mr Porter).
Seamless warm taupe studio sweep. Soft even catalog light. No bed, no props, no other people, no hanger hardware.`;

/** The whole brief for one look. A look with a pair in it is shown head to toe in that pair. */
export function formPrompt(pieces: { name: string; category: string }[]) {
  const shoes = pieces.find((piece) => piece.category === "shoes");
  const framing = shoes
    ? `Full figure in frame from collar to soles, both feet fully visible and standing on the floor. The figure wears on its feet the exact pair from the shoe reference photo (${shoes.name}): same colors, materials, logos, stripes, sole shape, and lacing. Open sandals stay open, with bare mannequin feet. Do not swap in generic shoes. Do not invent extra garments.`
    : "Full figure in frame, collar at the top, shoes optional and plain. Do not invent extra garments.";
  const names = pieces.map((piece) => piece.name).join(", ");
  return `${PROMPT}\n${framing}\nGarments in this look: ${names}.`;
}

async function garmentJpeg(bytes: Buffer) {
  return sharp(bytes)
    .rotate()
    .resize(1024, 1536, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function renderMannequin(userId: string, itemIds: string[]) {
  const ids = itemIds.filter(Boolean);
  const key = mannequinStorageKey(userId, comboKeyFromIds(ids));
  try {
    return { imagePath: key, bytes: await downloadBytes(key) };
  } catch {
    /* generate */
  }

  const items = await prisma.item.findMany({
    where: { id: { in: ids }, userId },
  });
  const ordered = ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => Boolean(item.imagePath));
  if (ordered.length < 2) {
    throw new Error("Need a top and a bottom to dress a form");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Add OPENAI_API_KEY to dress a form");
  }

  const files = await Promise.all(
    ordered.map(async (item, index) => {
      const jpeg = await garmentJpeg(await downloadBytes(item.imagePath));
      return toFile(jpeg, `${index}-${item.category}.jpg`, { type: "image/jpeg" });
    }),
  );

  const result = await openai.images.edit({
    model: imageModel(),
    image: files,
    prompt: formPrompt(ordered),
    size: "1024x1536",
    quality: "medium",
    output_format: "jpeg",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("The form came back empty");
  const bytes = await sharp(Buffer.from(b64, "base64"))
    .resize(1200, 1800, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();
  await uploadBytes(key, bytes);
  return { imagePath: key, bytes };
}
