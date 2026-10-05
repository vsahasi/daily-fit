import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { ingestPhoto } from "../src/lib/ingest";
import { refreshStyle } from "../src/lib/style";

const exec = promisify(execFile);

const PHONE = process.env.INGEST_PHONE ?? "";
const SOURCE = process.env.INGEST_DIR ?? path.join(os.homedir(), "Downloads");

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

async function main() {
  const user = await prisma.user.findUnique({ where: { phone: PHONE } });
  if (!user) {
    throw new Error(`No user for ${PHONE}. Sign in on the site first.`);
  }

  await prisma.item.deleteMany({ where: { userId: user.id, imagePath: "" } });

  const names = await fs.readdir(SOURCE);
  const files = preferHeic(names);

  console.log(`User ${user.id}. ${files.length} clothing photos in ${SOURCE}`);

  let ok = 0;
  let fail = 0;
  for (const name of files) {
    const full = path.join(SOURCE, name);
    process.stdout.write(`${name}… `);
    try {
      const bytes = await toJpeg(full);
      const item = await ingestPhoto({
        userId: user.id,
        bytes,
        mime: "image/jpeg",
        source: "web",
        skipStyle: true,
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
