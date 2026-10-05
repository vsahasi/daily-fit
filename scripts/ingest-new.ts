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
const SOURCE = process.env.INGEST_DIR ?? path.join(os.homedir(), "Downloads");

type Job = {
  img: number;
  rotation?: number;
  extra?: string;
  patch: Partial<CatalogedItem>;
};

const JOBS: Job[] = [
  {
    img: 9636,
    extra: "Grey Nike Harker Soccer long-sleeve Dri-FIT tee with eagle graphic. Keep HARKER SOCCER and the Nike swoosh. Short of a hoodie.",
    patch: {
      name: "Grey Nike Harker Soccer Long-Sleeve Tee",
      category: "top",
      subcategory: "tee",
      silhouette: "long-sleeve athletic tee",
      material: "Nike Dri-Fit",
      formality: 1,
      warmth: 2,
      occasions: ["gym"],
    },
  },
  {
    img: 9638,
    extra: "Navy New Balance athletic shorts, hem above the knee. This is a short, not a pant. Keep the NB logo.",
    patch: {
      name: "Navy New Balance Performance Short",
      category: "bottom",
      subcategory: "short",
      silhouette: "athletic short",
      material: "woven nylon",
      formality: 1,
      warmth: 1,
      layerRole: "bottom",
      occasions: ["gym", "weekend"],
    },
  },
  {
    img: 9639,
    rotation: 270,
    extra: "This photo is SIDEWAYS. Rotate so the waistband is at the TOP. Olive Abercrombie carpenter work pant, full length to the ankle, not shorts.",
    patch: {
      name: "Olive Abercrombie Carpenter Pant",
      category: "bottom",
      subcategory: "work pant",
      silhouette: "carpenter pant",
      formality: 2,
      warmth: 3,
      layerRole: "bottom",
      occasions: ["campus", "weekend", "house"],
    },
  },
  {
    img: 9640,
    extra: "Rust heather pullover hoodie, long sleeves. Collar/hood at the top. Lightweight knit hoodie, not a tee.",
    patch: {
      name: "Rust Heather Hoodie",
      category: "outer",
      subcategory: "hoodie",
      silhouette: "pullover hoodie",
      formality: 2,
      warmth: 4,
      layerRole: "mid",
      occasions: ["campus", "house", "weekend"],
    },
  },
  {
    img: 9641,
    extra: "Black Old Navy long-sleeve crewneck tee. Sleeve cuffs at the wrist. Plain, no graphic.",
    patch: {
      name: "Black Old Navy Long-Sleeve Tee",
      category: "top",
      subcategory: "tee",
      silhouette: "long-sleeve crewneck tee",
      formality: 2,
      warmth: 2,
      occasions: ["campus", "weekend", "house"],
    },
  },
  {
    img: 9642,
    extra: "Black COS short-sleeve crewneck tee. Short sleeves. Keep it a simple black tee.",
    patch: {
      name: "Black COS Short-Sleeve Tee",
      category: "top",
      subcategory: "tee",
      silhouette: "short-sleeve crewneck tee",
      formality: 3,
      warmth: 1,
      occasions: ["campus", "weekend", "evening"],
    },
  },
  {
    img: 9643,
    rotation: 270,
    extra: "This photo is SIDEWAYS. Rotate so the waistband is at the TOP. Brown fleece sweatpants, full length, elastic cuff. Not shorts.",
    patch: {
      name: "Brown Fleece Sweatpant",
      category: "bottom",
      subcategory: "sweatpant",
      silhouette: "fleece sweatpant",
      formality: 1,
      warmth: 4,
      layerRole: "bottom",
      occasions: ["house", "gym"],
    },
  },
  {
    img: 9644,
    rotation: 270,
    extra: "This photo is SIDEWAYS. Rotate so the waistband is at the TOP. Navy cargo work pant, full length, not shorts.",
    patch: {
      name: "Navy Cargo Work Pant",
      category: "bottom",
      subcategory: "cargo pant",
      silhouette: "cargo work pant",
      formality: 2,
      warmth: 3,
      layerRole: "bottom",
      occasions: ["campus", "weekend", "house"],
    },
  },
  {
    img: 9645,
    rotation: 270,
    extra: "This photo is SIDEWAYS. Rotate so the waistband is at the TOP. Charcoal cargo work pant, full length, brass zip. Not shorts.",
    patch: {
      name: "Charcoal Cargo Work Pant",
      category: "bottom",
      subcategory: "cargo pant",
      silhouette: "cargo work pant",
      formality: 2,
      warmth: 3,
      layerRole: "bottom",
      occasions: ["campus", "weekend", "house"],
    },
  },
  {
    img: 9646,
    extra: "Grey heather Vuori short-sleeve pocket tee. Keep the chest pocket and small Vuori tag. Short sleeves.",
    patch: {
      name: "Grey Vuori Pocket Tee",
      category: "top",
      subcategory: "tee",
      silhouette: "short-sleeve pocket tee",
      formality: 2,
      warmth: 1,
      occasions: ["weekend", "campus", "house"],
    },
  },
  {
    img: 9647,
    extra: "Charcoal Adidas short-sleeve tee with yellow trefoil and red-yellow shoulder stripes. Keep the Adidas mark. Short sleeves.",
    patch: {
      name: "Charcoal Adidas Trefoil Stripe Tee",
      category: "top",
      subcategory: "tee",
      silhouette: "short-sleeve raglan tee",
      formality: 2,
      warmth: 1,
      occasions: ["weekend", "house", "gym"],
    },
  },
  {
    img: 9648,
    extra: "Green Nike Harker Soccer short-sleeve Dri-FIT tee. Keep HARKER H SOCCER and the Nike swoosh. Short sleeves, not a knit.",
    patch: {
      name: "Green Nike Harker Soccer Dri-Fit Tee",
      category: "top",
      subcategory: "tee",
      silhouette: "short-sleeve athletic tee",
      material: "Nike Dri-Fit",
      formality: 1,
      warmth: 1,
      occasions: ["gym"],
    },
  },
  {
    img: 9649,
    extra: "Navy Marine Layer short-sleeve tee with a small circular chest logo. Short sleeves. Keep the logo.",
    patch: {
      name: "Navy Marine Layer Short-Sleeve Tee",
      category: "top",
      subcategory: "tee",
      silhouette: "short-sleeve crewneck tee",
      formality: 2,
      warmth: 1,
      occasions: ["weekend", "campus", "house"],
    },
  },
  {
    img: 9650,
    extra: "Blue Goodfellow short-sleeve pique polo. Collar at the TOP. Short sleeves, not long-sleeve. Keep the knit pique texture.",
    patch: {
      name: "Blue Goodfellow Short-Sleeve Polo",
      category: "top",
      subcategory: "polo",
      silhouette: "short-sleeve polo",
      formality: 3,
      warmth: 2,
      occasions: ["campus", "weekend", "evening"],
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
  return {
    rotation: job.rotation,
    extra: job.extra,
    patch: job.patch,
  };
}

async function main() {
  const user = await prisma.user.findUnique({ where: { phone: PHONE } });
  if (!user) throw new Error(`No user for ${PHONE}`);

  await prisma.item.deleteMany({ where: { userId: user.id, imagePath: "" } });

  console.log(`User ${user.id}. ${JOBS.length} new photos`);
  let ok = 0;
  let fail = 0;
  for (const job of JOBS) {
    process.stdout.write(`IMG_${job.img}… `);
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
      console.log(`${item.name} (${item.formality})`);
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
