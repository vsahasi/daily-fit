import { ClosetGrid } from "@/components/closet-grid";
import { Shell } from "@/components/shell";
import { UploadDrop } from "@/components/upload-drop";
import { daysBetween, todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { wornAgo } from "@/lib/names";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function ClosetPage() {
  const user = await getCurrentUser();
  const items = await prisma.item.findMany({
    where: { userId: user.id, NOT: { imagePath: "" } },
    orderBy: { createdAt: "desc" },
  });
  const needsKey = !process.env.OPENAI_API_KEY;
  const today = todayInZone(user.timezone);

  if (items.length === 0) {
    return (
      <Shell>
        {needsKey ? (
          <p className="mb-6 text-[13px] text-warn">Photo cataloging is off until an API key is added.</p>
        ) : null}
        <div className="flex min-h-[70vh] flex-col justify-end bg-snow px-8 py-12 sm:px-12">
          <h1 className="max-w-xl text-[32px] leading-tight">Photograph what you already wear.</h1>
          <div className="mt-8">
            <UploadDrop variant="quiet" />
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {needsKey ? (
        <p className="mb-6 text-[13px] text-warn">Photo cataloging is off until an API key is added.</p>
      ) : null}
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] leading-tight">Closet</h1>
          <p className="mt-3 max-w-[42ch] text-[14px] leading-[22px] text-mute">
            {items.length} {items.length === 1 ? "piece" : "pieces"}
            {user.locationLabel ? ` · ${user.locationLabel}` : ""}
          </p>
        </div>
        <UploadDrop variant="quiet" />
      </div>
      <ClosetGrid
        items={items.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          material: item.material,
          warmth: item.warmth,
          status: item.status,
          worn: item.lastWornAt
            ? wornAgo(daysBetween(todayInZone(user.timezone, item.lastWornAt), today))
            : null,
        }))}
      />
    </Shell>
  );
}
