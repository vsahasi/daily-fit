import { EventLook } from "@/components/event-look";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { describeOccasion, occasionFromWeatherJson } from "@/lib/occasion";
import type { Weather } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function EventPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const user = await getCurrentUser();
  const { note } = await searchParams;
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
  const occasion = occasionFromWeatherJson(outfit?.weatherJson ?? "");
  const scenario = occasion?.label ?? stored?.scenario ?? "";
  // What the line was read as, and where the forecast came from when it was not home.
  const readAs = occasion ? describeOccasion(occasion) : "";
  const forecastAt = occasion?.place && stored?.locationLabel ? stored.locationLabel : "";

  return (
    <Shell>
      <PageIntro title="Event">
        <p>
          Say what you’re walking into, the way you’d say it. Dinner, the beach, an interview,
          a late night at the library, Boston on Friday, a cold one. It reads the line and picks
          from the closet for that, in the forecast where and when it happens. For a stack you
          can swipe, open Looks.
        </p>
      </PageIntro>
      {note ? <p className="mb-8 text-[13px] text-warn">{note}</p> : null}
      <EventLook
        scenario={scenario}
        readAs={readAs}
        forecastAt={forecastAt}
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
