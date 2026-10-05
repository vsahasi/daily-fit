import { randomBytes } from "node:crypto";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { updateTag } from "next/cache";
import { readSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/sms";

function userCacheTag(userId: string) {
  return `user-${userId}`;
}

async function loadUserById(userId: string) {
  return unstable_cache(
    async () => prisma.user.findUnique({ where: { id: userId } }),
    [`daily-fit-user-${userId}`],
    { revalidate: 300, tags: [userCacheTag(userId)] },
  )();
}

export const getOptionalUser = cache(async () => {
  const userId = await readSessionUserId();
  if (!userId) return null;
  return loadUserById(userId);
});

export const getCurrentUser = cache(async () => {
  const user = await getOptionalUser();
  if (!user) {
    throw new Error("Not signed in");
  }
  return user;
});

export function revalidateUser(userId: string) {
  updateTag(userCacheTag(userId));
}

export async function userFromPhone(raw: string) {
  const phone = normalizePhone(raw);
  return prisma.user.upsert({
    where: { phone },
    update: {},
    create: {
      phone,
      shortcutSecret: randomBytes(16).toString("hex"),
    },
  });
}
