import path from "node:path";
import fs from "node:fs/promises";

export const dataDir = path.join(process.cwd(), "data");

export function itemImagePath(userId: string, itemId: string) {
  return path.join(dataDir, "uploads", userId, `${itemId}.jpg`);
}

export function collagePath(userId: string, outfitId: string) {
  return path.join(dataDir, "collages", userId, `${outfitId}.jpg`);
}

export async function ensureParent(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}
