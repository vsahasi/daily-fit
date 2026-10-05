import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { downloadBytes } from "@/lib/storage";
import { getCurrentUser } from "@/lib/user";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const user = await getCurrentUser();
  const { itemId } = await context.params;
  const item = await prisma.item.findFirst({
    where: { id: itemId, userId: user.id },
  });
  if (!item?.imagePath) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const bytes = await downloadBytes(item.imagePath);
    return new Response(bytes, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
