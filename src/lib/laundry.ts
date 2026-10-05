import { prisma } from "@/lib/db";
import { addDays } from "@/lib/dates";

export async function putInWash(userId: string, itemId: string, days: number) {
  const washDays = Math.min(14, Math.max(1, Math.round(days)));
  await prisma.item.updateMany({
    where: { id: itemId, userId },
    data: {
      status: "wash",
      washUntil: addDays(new Date(), washDays),
      washDays,
    },
  });
}

export async function markClean(userId: string, itemId: string) {
  await prisma.item.updateMany({
    where: { id: itemId, userId },
    data: { status: "available", washUntil: null },
  });
}

export async function releaseDueLaundry() {
  await prisma.item.updateMany({
    where: {
      status: "wash",
      washUntil: { lte: new Date() },
    },
    data: { status: "available", washUntil: null },
  });
}

export async function finishLaundry(userId: string) {
  await prisma.item.updateMany({
    where: { userId, status: "wash" },
    data: { status: "available", washUntil: null },
  });
}
