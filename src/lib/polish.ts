import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { imageModel } from "@/lib/openai";

const SWEEP = { r: 200, g: 198, b: 190 };
const CANVAS_W = 1200;
const CANVAS_H = 1600;

const STUDIO_PROMPT = `E-commerce product photograph of this exact garment, as if it is a listing on a clothing site (SSENSE, Mr Porter, Arket).
Ghost mannequin or invisible hanger. The garment is filled out, smooth, and wrinkle-free.
Upright: collar or waistband at the TOP of the frame, hem at the BOTTOM, sleeves hanging naturally at the sides.
If the source photo is sideways or upside down, correct it. Never leave a collar at the bottom or to the side.
Seamless warm taupe studio sweep. Soft even catalog light. No bed, no floor, no hanger hardware, no people, no other clothes, no props, no shadows of a room.
Keep the true garment: colors, logos, text, cut, sleeve length, and fabric. Do not turn short sleeves into long sleeves or a knit into a dress. Do not invent a different piece.`;

const SHOE_PROMPT = `E-commerce product photograph of this exact pair of shoes, as if it is a listing on a footwear site (SSENSE, Mr Porter, END.).
Both shoes of the pair, standing on their soles side by side, seen from a front three-quarter angle so the outer side profile and the toe are both visible.
The whole pair sits centered with generous margin inside a vertical frame. Nothing is cropped.
Clean and new-looking: no dirt, no scuffs, laces tied neatly. Open sandals stay open, with no laces added.
Seamless warm taupe studio sweep. Soft even catalog light, a faint contact shadow under the soles. No floor tiles, no feet, no legs, no other shoes, no props, no shadows of a room.
Keep the true shoe: colors, materials, logos, stripes, stitching, sole shape, and lacing. Do not invent a different shoe.`;

function cropRegion(width: number, height: number, bbox: [number, number, number, number]) {
  const clamped = bbox.map((n) => Math.min(1, Math.max(0, n))) as [number, number, number, number];
  const [x, y] = clamped;
  let [, , w, h] = clamped;
  if (w > x && h > y && w + x > 1.02) {
    w = Math.max(0.15, w - x);
    h = Math.max(0.15, h - y);
  }
  const pad = 0.06;
  const left = Math.min(Math.max(0, Math.floor((x - pad) * width)), Math.max(0, width - 8));
  const top = Math.min(Math.max(0, Math.floor((y - pad) * height)), Math.max(0, height - 8));
  return {
    left,
    top,
    width: Math.min(Math.max(8, Math.ceil((w + pad * 2) * width)), width - left),
    height: Math.min(Math.max(8, Math.ceil((h + pad * 2) * height)), height - top),
  };
}

async function studioPolish(bytes: Buffer, rotation = 0, extra = "", category = "") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("missing openai");
  let pipeline = sharp(bytes).rotate();
  if (rotation) pipeline = pipeline.rotate(rotation);
  const jpeg = await pipeline
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const openai = new OpenAI({ apiKey: key });
  const studio = category === "shoes" ? SHOE_PROMPT : STUDIO_PROMPT;
  const prompt = extra ? `${studio}\n${extra}` : studio;
  const result = await openai.images.edit({
    model: imageModel(),
    image: await toFile(jpeg, "garment.jpg", { type: "image/jpeg" }),
    prompt,
    size: "1024x1536",
    quality: "high",
    output_format: "jpeg",
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("studio polish returned nothing");
  return sharp(Buffer.from(b64, "base64"))
    .resize(CANVAS_W, CANVAS_H, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function cropPolish(
  bytes: Buffer,
  bbox: [number, number, number, number],
  rotation: number,
) {
  const oriented = await sharp(bytes).rotate().rotate(rotation).toBuffer();
  const source = sharp(oriented);
  const meta = await source.metadata();
  const width = meta.width ?? CANVAS_W;
  const height = meta.height ?? CANVAS_H;
  const region = cropRegion(width, height, bbox);

  let garment: Buffer;
  try {
    garment = await source
      .extract(region)
      .normalize()
      .modulate({ brightness: 1.04, saturation: 1.06 })
      .sharpen({ sigma: 0.8 })
      .resize(Math.round(CANVAS_W * 0.78), Math.round(CANVAS_H * 0.78), {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    garment = await sharp(oriented)
      .resize(Math.round(CANVAS_W * 0.78), Math.round(CANVAS_H * 0.78), {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  }

  return sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 3,
      background: SWEEP,
    },
  })
    .composite([{ input: garment, gravity: "center" }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function polishGarment(
  bytes: Buffer,
  bbox: [number, number, number, number] = [0.08, 0.08, 0.84, 0.84],
  rotation = 0,
  extra = "",
  category = "",
) {
  try {
    return await studioPolish(bytes, rotation, extra, category);
  } catch {
    return cropPolish(bytes, bbox, rotation);
  }
}
