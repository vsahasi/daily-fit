import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { ingestPhoto, type IngestHints } from "../src/lib/ingest";
import { refreshStyle } from "../src/lib/style";
import type { CatalogedItem } from "../src/lib/types";

const exec = promisify(execFile);
const PHONE = process.env.INGEST_PHONE ?? "";
if (!PHONE) throw new Error("Set INGEST_PHONE to the account's phone number, in E.164 form");
const SOURCE = process.env.INGEST_DIR ?? path.join(os.homedir(), "Downloads");

type Job = {
  img: number;
  extra: string;
  patch: Partial<CatalogedItem> & { name: string };
};

const JOBS: Job[] = [
  {
    img: 9651,
    extra:
      "Black Adidas Adizero running shoes: black engineered mesh upper, tonal grey three stripes on the side, black laces, thick black midsole. The pair in the middle is the item. Ignore the cream sneaker, the tan sandal, and the foot at the edges.",
    patch: {
      name: "Black Adidas Adizero Runner",
      category: "shoes",
      subcategory: "runner",
      colors: ["black", "charcoal"],
      colorFamilies: ["black"],
      material: "engineered mesh",
      pattern: "solid",
      formality: 1,
      warmth: 2,
      rainOk: true,
      fit: "regular",
      silhouette: "low-top running shoe",
      layerRole: "shoe",
      occasions: ["gym", "campus", "travel", "weekend"],
      rotation: 0,
    },
  },
  {
    img: 9652,
    extra:
      "Tan faux-leather flip-flops: open thong sandal, tan footbed and straps, white contrast stitching, embossed shark logo and QuickShark wordmark on the footbed. No laces, no closed toe. The pair in the middle is the item. Ignore the black shoe and the foot at the edges.",
    patch: {
      name: "Tan QuickShark Flip-Flop",
      category: "shoes",
      subcategory: "flip-flop",
      colors: ["tan"],
      colorFamilies: ["sand"],
      material: "faux leather",
      pattern: "solid",
      formality: 1,
      warmth: 1,
      rainOk: false,
      fit: "regular",
      silhouette: "thong sandal",
      layerRole: "shoe",
      occasions: ["beach", "house", "weekend"],
      rotation: 0,
    },
  },
  {
    img: 9653,
    extra:
      "Cream Adidas Ultraboost knit sneakers: cream Primeknit upper, translucent cream midfoot cage with three stripes, cream laces, white Boost sole. Show them clean. The pair in the middle is the item. Ignore the black shoes, the boot, and the foot at the edges.",
    patch: {
      name: "Cream Adidas Ultraboost Sneaker",
      category: "shoes",
      subcategory: "sneaker",
      colors: ["cream", "beige"],
      colorFamilies: ["cream"],
      material: "Primeknit",
      pattern: "solid",
      formality: 2,
      warmth: 2,
      rainOk: false,
      fit: "regular",
      silhouette: "low-top knit sneaker",
      layerRole: "shoe",
      occasions: ["campus", "weekend", "travel", "house"],
      rotation: 0,
    },
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

function hintsFor(job: Job): IngestHints {
  return { rotation: 0, extra: job.extra, patch: job.patch };
}

async function main() {
  const user = await prisma.user.findUnique({ where: { phone: PHONE } });
  if (!user) throw new Error(`No user for ${PHONE}`);

  await prisma.item.deleteMany({ where: { userId: user.id, imagePath: "" } });

  console.log(`User ${user.id}. ${JOBS.length} pairs of shoes`);
  let ok = 0;
  let fail = 0;
  for (const job of JOBS) {
    process.stdout.write(`IMG_${job.img}… `);
    // Safe to run twice: a pair already in the closet is left alone.
    const existing = await prisma.item.findFirst({
      where: { userId: user.id, category: "shoes", name: job.patch.name },
    });
    if (existing) {
      console.log(`${existing.name} is already in the closet`);
      continue;
    }
    try {
      const bytes = await toJpeg(await findOriginal(job.img));
      const item = await ingestPhoto({
        userId: user.id,
        bytes,
        mime: "image/jpeg",
        source: "web",
        skipStyle: true,
        hints: hintsFor(job),
      });
      console.log(`${item.name} (${item.id})`);
      ok += 1;
    } catch (error) {
      fail += 1;
      console.log(error instanceof Error ? error.message : "failed");
    }
  }

  if (ok > 0) {
    process.stdout.write("style… ");
    await refreshStyle(user.id)
      .then(() => console.log("ok"))
      .catch((error) => console.log(error instanceof Error ? error.message : "failed"));
  }
  console.log(`Done. ${ok} added, ${fail} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
