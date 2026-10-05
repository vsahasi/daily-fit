import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { polishGarment } from "../src/lib/polish";
import { itemStorageKey, uploadBytes } from "../src/lib/storage";
import { refreshStyle } from "../src/lib/style";
import { catalogPhotoBytes } from "../src/lib/vision";
import type { CatalogedItem } from "../src/lib/types";

const exec = promisify(execFile);
const PHONE = process.env.INGEST_PHONE ?? "";
const SOURCE = process.env.INGEST_DIR ?? path.join(os.homedir(), "Downloads");

type Patch = Partial<
  Pick<
    CatalogedItem,
    | "name"
    | "subcategory"
    | "material"
    | "silhouette"
    | "formality"
    | "warmth"
    | "colors"
    | "colorFamilies"
    | "occasions"
    | "layerRole"
  >
>;

const FIXES: Record<number, Patch> = {
  9589: { name: "Charcoal Harker Soccer Hoodie", subcategory: "hoodie" },
  9602: {
    name: "Mexico Green Yellow Stripe Jersey",
    subcategory: "jersey",
    colors: ["green", "yellow"],
    colorFamilies: ["green", "yellow"],
  },
  9603: {
    name: "Real Madrid Teka Home Jersey",
    subcategory: "jersey",
    colors: ["white", "navy", "gold"],
    colorFamilies: ["white", "navy"],
  },
  9605: {
    name: "Navy Textured Short-Sleeve Crewneck Sweater",
    subcategory: "sweater",
    silhouette: "short-sleeve crewneck sweater",
  },
  9600: {
    name: "Cal Navy Nike Short-Sleeve Jersey",
    subcategory: "jersey",
    silhouette: "short-sleeve athletic jersey",
  },
  9608: {
    name: "Navy Cal Short-Sleeve Polo",
    subcategory: "polo",
    silhouette: "short-sleeve polo",
    warmth: 2,
  },
  9604: {
    name: "Faded Navy Short-Sleeve Henley",
    subcategory: "henley",
    silhouette: "short-sleeve henley",
    warmth: 2,
  },
  9625: {
    name: "Sand Straight Chino Short",
    subcategory: "short",
    silhouette: "straight chino short",
    warmth: 2,
    formality: 2,
    layerRole: "bottom",
  },
  9633: {
    name: "Black Nike Harker Soccer Dri-Fit Tee",
    subcategory: "tee",
    material: "Nike Dri-Fit",
    silhouette: "athletic tee",
    warmth: 1,
  },
  9635: {
    name: "Vuori Grey-Gold Dress Pant",
    subcategory: "dress pant",
    silhouette: "straight dress pant",
    formality: 4,
    colors: ["grey", "taupe", "gold"],
    colorFamilies: ["grey", "gold"],
    occasions: ["evening", "weekend"],
  },
};

function isClothingFile(name: string) {
  const match = name.match(/IMG_(\d+)/i);
  if (!match) return false;
  const n = Number(match[1]);
  return n >= 9587 && n <= 9635;
}

function preferHeic(names: string[]) {
  const byNumber = new Map<string, string>();
  for (const name of names.filter((file) => isClothingFile(file) && /\.(heic|heif|jpe?g)$/i.test(file))) {
    const key = name.match(/IMG_\d+/i)?.[0] ?? name;
    const existing = byNumber.get(key);
    if (!existing || /\.heic$/i.test(name)) {
      byNumber.set(key, name);
    }
  }
  return [...byNumber.values()].sort();
}

async function toJpeg(file: string) {
  if (/\.jpe?g$/i.test(file)) {
    return fs.readFile(file);
  }
  const out = path.join(os.tmpdir(), `df-${path.basename(file)}.jpg`);
  await exec("sips", ["-s", "format", "jpeg", file, "--out", out]);
  return fs.readFile(out);
}

function applyPatch(catalog: CatalogedItem, patch?: Patch): CatalogedItem {
  if (!patch) return catalog;
  return {
    ...catalog,
    ...patch,
    colors: patch.colors ?? catalog.colors,
    colorFamilies: patch.colorFamilies ?? catalog.colorFamilies,
    occasions: patch.occasions ?? catalog.occasions,
  };
}

async function main() {
  const user = await prisma.user.findUnique({ where: { phone: PHONE } });
  if (!user) throw new Error(`No user for ${PHONE}`);

  const items = await prisma.item.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const files = preferHeic(await fs.readdir(SOURCE));
  if (files.length !== items.length) {
    console.log(`Warning: ${files.length} photos, ${items.length} items. Pairing by order.`);
  }
  const count = Math.min(files.length, items.length);
  console.log(`Recatalog ${count} pieces`);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < count; i += 1) {
    const name = files[i];
    const item = items[i];
    const n = Number(name.match(/IMG_(\d+)/i)?.[1] ?? 0);
    process.stdout.write(`${name} ${item.name}… `);
    try {
      const bytes = await toJpeg(path.join(SOURCE, name));
      const catalog = applyPatch(await catalogPhotoBytes(bytes), FIXES[n]);
      const polished = await polishGarment(bytes, catalog.bbox, catalog.rotation);
      const key = item.imagePath || itemStorageKey(user.id, item.id);
      await uploadBytes(key, polished);
      await prisma.item.update({
        where: { id: item.id },
        data: {
          imagePath: key,
          name: catalog.name,
          category: catalog.category,
          subcategory: catalog.subcategory,
          colors: JSON.stringify(catalog.colors),
          material: catalog.material,
          pattern: catalog.pattern,
          formality: catalog.formality,
          warmth: catalog.warmth,
          rainOk: catalog.rainOk,
          notes: catalog.notes,
          fit: catalog.fit,
          silhouette: catalog.silhouette,
          layerRole: catalog.layerRole,
          colorFamilies: JSON.stringify(catalog.colorFamilies),
          pairsWith: JSON.stringify(catalog.pairsWith),
          avoidWith: JSON.stringify(catalog.avoidWith),
          profile: JSON.stringify({
            fit: catalog.fit,
            silhouette: catalog.silhouette,
            layerRole: catalog.layerRole,
            colorFamilies: catalog.colorFamilies,
            pairsWith: catalog.pairsWith,
            avoidWith: catalog.avoidWith,
            occasions: catalog.occasions,
            stretch: catalog.stretch,
            patternScale: catalog.patternScale,
          }),
        },
      });
      console.log(`${catalog.name} (${catalog.formality})`);
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
  console.log(`Done. ${ok} updated, ${fail} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
