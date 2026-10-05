import { EventLook } from "@/components/event-look";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { occasionFromWeatherJson } from "@/lib/occasion";
import type { Weather } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function EventPage() {
  const user = await getCurrentUser();
  const outfit = await prisma.outfit.findFirst({
    where: { userId: user.id, date: `${todayInZone(user.timezone)}:event`, status: "event" },
    orderBy: { createdAt: "desc" },
  });
  const ids = outfit ? (JSON.parse(outfit.itemIds) as string[]) : [];
  const items = ids.length ? await prisma.item.findMany({ where: { id: { in: ids } } }) : [];
  const ordered = ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const stored = outfit ? (JSON.parse(outfit.weatherJson) as Weather & { scenario?: string }) : null;
  const scenario = occasionFromWeatherJson(outfit?.weatherJson ?? "")?.label ?? stored?.scenario ?? "";

  return (
    <Shell>
      <PageIntro title="Event">
        <p>
          Type what you’re walking into. Dinner, the beach, an interview, the gym. It picks from
          the closet for that. For a stack you can swipe, open Looks.
        </p>
      </PageIntro>
      <EventLook
        scenario={scenario}
        reason={outfit?.reason ?? ""}
        pieces={ordered.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          material: item.material,
          warmth: item.warmth,
        }))}
      />
    </Shell>
  );
}
