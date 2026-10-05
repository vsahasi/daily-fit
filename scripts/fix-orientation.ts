import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { polishGarment } from "../src/lib/polish";
import { uploadBytes } from "../src/lib/storage";

const exec = promisify(execFile);
const SOURCE = path.join(os.homedir(), "Downloads");

const JOBS = [
  {
    img: 9608,
    match: "Navy Logo Long-Sleeve Polo",
    rotation: 180,
    extra: "This photo is UPSIDE DOWN. Rotate 180 so the collar is at the top. It is a SHORT-SLEEVE navy Cal polo, not long-sleeve. Keep the Cal script logo.",
    name: "Navy Cal Short-Sleeve Polo",
    subcategory: "polo",
    silhouette: "short-sleeve polo",
    warmth: 2,
  },
  {
    img: 9605,
    match: "Navy Textured Crewneck Sweater",
    rotation: 90,
    extra: "This photo is SIDEWAYS. Rotate so the collar is at the top. It is a SHORT-SLEEVE textured crewneck sweater, not a dress. Keep a sweater length, not a tunic.",
    name: "Navy Textured Short-Sleeve Crewneck Sweater",
    subcategory: "sweater",
    silhouette: "short-sleeve crewneck sweater",
    warmth: 3,
  },
  {
    img: 9609,
    match: "Sage Pinstripe",
    rotation: 90,
    extra: "This photo is SIDEWAYS. Rotate so the collar is at the top. Long-sleeve sage pinstripe linen button-up. Sleeves to the wrist.",
    name: "Sage Pinstripe Button-Up Shirt",
    subcategory: "button-up shirt",
    silhouette: "long-sleeve button-up shirt",
    warmth: 2,
  },
  {
    img: 9600,
    match: "Cal Navy Nike Jersey",
    rotation: 270,
    extra: "This photo is SIDEWAYS. Rotate so the collar is at the top. Short-sleeve Cal Nike jersey. Keep the yellow Cal script and Nike swoosh.",
    name: "Cal Navy Nike Short-Sleeve Jersey",
    subcategory: "jersey",
    silhouette: "short-sleeve athletic jersey",
    warmth: 2,
  },
];

async function toJpeg(file: string) {
  if (/\.jpe?g$/i.test(file)) return fs.readFile(file);
  const out = path.join(os.tmpdir(), `df-${path.basename(file)}.jpg`);
  await exec("sips", ["-s", "format", "jpeg", file, "--out", out]);
  return fs.readFile(out);
}

async function findOriginal(n: number) {
  const names = await fs.readdir(SOURCE);
  const hit = names.find((name) => name.toUpperCase().startsWith(`IMG_${n}.`) && /\.(heic|heif|jpe?g)$/i.test(name));
  if (!hit) throw new Error(`missing IMG_${n}`);
  return path.join(SOURCE, hit);
}

async function main() {
  for (const job of JOBS) {
    const item = await prisma.item.findFirst({
      where: { name: { contains: job.match } },
    });
    if (!item) {
      console.log("skip, no item for", job.match);
      continue;
    }
    process.stdout.write(`${job.img} ${item.name}… `);
    const bytes = await toJpeg(await findOriginal(job.img));
    const polished = await polishGarment(bytes, [0.08, 0.08, 0.84, 0.84], job.rotation, job.extra);
    await uploadBytes(item.imagePath, polished);
    await prisma.item.update({
      where: { id: item.id },
      data: {
        name: job.name,
        subcategory: job.subcategory,
        silhouette: job.silhouette,
        warmth: job.warmth,
      },
    });
    const preview = path.join(os.tmpdir(), `df-preview-${job.img}.jpg`);
    await fs.writeFile(preview, polished);
    console.log(`-> ${job.name} ${preview}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
