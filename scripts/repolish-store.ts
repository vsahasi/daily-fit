import { prisma } from "../src/lib/db";
import { polishGarment } from "../src/lib/polish";
import { downloadBytes, uploadBytes } from "../src/lib/storage";

const SKIP = new Set([
  "Navy Cal Short-Sleeve Polo",
  "Navy Textured Short-Sleeve Crewneck Sweater",
  "Sage Pinstripe Button-Up Shirt",
  "Cal Navy Nike Short-Sleeve Jersey",
]);

async function main() {
  const items = await prisma.item.findMany({
    where: { user: { phone: process.env.INGEST_PHONE ?? "" } },
    orderBy: { createdAt: "asc" },
  });
  let ok = 0;
  let fail = 0;
  for (const item of items) {
    if (SKIP.has(item.name)) {
      console.log(`skip ${item.name}`);
      continue;
    }
    process.stdout.write(`${item.name}… `);
    try {
      const bytes = await downloadBytes(item.imagePath);
      const polished = await polishGarment(
        bytes,
        [0.08, 0.08, 0.84, 0.84],
        0,
        "The garment is already upright. Refine it into a cleaner, smoother clothing-site product photo. Keep sleeve length and logos exactly.",
      );
      await uploadBytes(item.imagePath, polished);
      console.log("ok");
      ok += 1;
    } catch (error) {
      fail += 1;
      console.log(error instanceof Error ? error.message : "failed");
    }
  }
  console.log(`Done. ${ok} polished, ${fail} failed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
