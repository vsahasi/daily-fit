import { prisma } from "@/lib/db";
import { bytesToJpeg } from "@/lib/heic";
import { polishGarment } from "@/lib/polish";
import { itemStorageKey, uploadBytes, deleteObject } from "@/lib/storage";
import { refreshStyle } from "@/lib/style";
import type { CatalogedItem } from "@/lib/types";
import { catalogPhotoBytes } from "@/lib/vision";

export type IngestHints = {
  rotation?: number;
  extra?: string;
  patch?: Partial<CatalogedItem>;
};

export async function ingestPhoto(opts: {
  userId: string;
  bytes: Buffer;
  mime?: string;
  source: "web" | "sms";
  skipStyle?: boolean;
  hints?: IngestHints;
}) {
  const item = await prisma.item.create({
    data: {
      userId: opts.userId,
      imagePath: "",
      name: "New piece",
      category: "top",
      colors: "[]",
      source: opts.source,
    },
  });

  const key = itemStorageKey(opts.userId, item.id);

  try {
    const jpeg = await bytesToJpeg(opts.bytes, opts.mime);
    const catalog = applyHints(await catalogPhotoBytes(jpeg), opts.hints);
    const polished = await polishGarment(jpeg, catalog.bbox, catalog.rotation, opts.hints?.extra);

    await uploadBytes(key, polished);
    const saved = await prisma.item.update({
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
    if (!opts.skipStyle) {
      await refreshStyle(opts.userId).catch(() => undefined);
    }
    return saved;
  } catch (error) {
    await deleteObject(key).catch(() => undefined);
    await prisma.item.delete({ where: { id: item.id } });
    throw error;
  }
}

function applyHints(catalog: CatalogedItem, hints?: IngestHints): CatalogedItem {
  if (!hints) return catalog;
  const patch = hints.patch ?? {};
  return {
    ...catalog,
    ...patch,
    rotation: hints.rotation ?? patch.rotation ?? catalog.rotation,
    colors: patch.colors ?? catalog.colors,
    colorFamilies: patch.colorFamilies ?? catalog.colorFamilies,
    occasions: patch.occasions ?? catalog.occasions,
    pairsWith: patch.pairsWith ?? catalog.pairsWith,
    avoidWith: patch.avoidWith ?? catalog.avoidWith,
  };
}
