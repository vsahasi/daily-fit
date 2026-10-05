import Link from "next/link";
import { makeTodayOutfit } from "@/app/actions";
import { LookSpread } from "@/components/look-spread";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { ShopIdeas } from "@/components/shop-ideas";
import { StillOut } from "@/components/still-out";
import { WhereYouAre } from "@/components/where-you-are";
import { shiftDate, todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { ensureLook } from "@/lib/outfit";
import { layerRole } from "@/lib/kinds";
import { comboKeyFromIds, normalizeStack } from "@/lib/pair";
import { parseDecisions } from "@/lib/rotation";
import { currentIdeas } from "@/lib/shop";
import { mannequinStorageKey, objectExists } from "@/lib/storage";
import type { Weather } from "@/lib/types";
import { getCurrentUser } from "@/lib/user";
import { findLeftovers, lookForDate } from "@/lib/wear";
import { weatherDek } from "@/lib/weather";

export const dynamic = "force-dynamic";

function pickHero<T extends { category: string }>(pieces: T[]) {
  return (
    pieces.find((piece) => piece.category === "outer") ??
    pieces.find((piece) => piece.category === "top") ??
    pieces[0]
  );
}

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ note?: string; day?: string }> }) {
  const user = await getCurrentUser();
  const { note, day } = await searchParams;
  // The evening ping dresses tomorrow; its link opens that look, not today's.
  const preview = day === "tomorrow";
  const hasPlace = user.latitude != null && user.longitude != null;
  const realToday = todayInZone(user.timezone);
  const today = preview ? shiftDate(realToday, 1) : realToday;

  if (!hasPlace) {
    return (
      <Shell bleed>
        <PageIntro title="Where should we dress you?">
          <p>The look follows the forecast at this place.</p>
        </PageIntro>
        <WhereYouAre city={null} />
      </Shell>
    );
  }

  let error = "";
  let outfit = null;
  try {
    outfit = await ensureLook(user, today);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not build today's outfit";
    outfit = await lookForDate(user.id, today);
  }

  const ids = outfit ? (JSON.parse(outfit.itemIds) as string[]) : [];
  const [items, leftovers, hasForm, liked, ideas, clean] = await Promise.all([
    ids.length ? prisma.item.findMany({ where: { id: { in: ids }, userId: user.id } }) : [],
    findLeftovers(user, realToday),
    ids.length >= 2
      ? objectExists(mannequinStorageKey(user.id, comboKeyFromIds(ids))).catch(() => false)
      : false,
    ids.length >= 2
      ? prisma.lookVote.count({ where: { userId: user.id, comboKey: comboKeyFromIds(ids), verdict: "like" } })
      : 0,
    currentIdeas(user.id, 1),
    prisma.item.findMany({ where: { userId: user.id, status: "available", NOT: { imagePath: "" } } }),
  ]);
  // Swap is offered only where a real trade exists: another clean piece for that slot, not already in the look.
  const spare = clean.filter((item) => !ids.includes(item.id));
  const baseTop = normalizeStack(items.filter((item) => item.category !== "shoes")).top;
  const canSwap = (item: (typeof items)[number]) =>
    item.category === "outer" || (item.category === "top" && item.id !== baseTop?.id)
      ? spare.some((other) => other.category === "outer" || (other.category === "top" && layerRole(other) === "mid"))
      : spare.some((other) => other.category === item.category);
  const ordered = ids
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const weather = outfit ? (JSON.parse(outfit.weatherJson) as Weather) : null;
  const decisions = parseDecisions(outfit?.decisionsJson);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
    // Read from the date itself, at noon, so the name never slips a day at the edges.
  }).format(new Date(`${today}T12:00:00Z`));

  const hero = pickHero(ordered);
  const toPiece = (item: (typeof ordered)[number]) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    material: item.material,
    warmth: item.warmth,
    decision: decisions[item.id] ?? null,
    canSwap: canSwap(item),
  });
  const stillOut = (
    <StillOut
      pieces={leftovers.map((row) => ({
        outfitId: row.outfitId,
        id: row.item.id,
        name: row.item.name,
        material: row.item.material,
      }))}
    />
  );

  return (
    <Shell bleed>
      {note ? <p className="mb-8 text-[13px] text-warn">{note}</p> : null}
      {error ? (
        <p className="mb-8 text-[13px] text-warn">
          {error}{" "}
          {error.includes("top") ? (
            <Link href="/" className="text-ink underline-offset-2 hover:underline">
              Add clothes
            </Link>
          ) : null}
        </p>
      ) : null}

      {outfit && hero ? (
        <LookSpread
          key={outfit.id}
          weekday={weekday}
          dek={weather ? weatherDek(weather) : ""}
          place={<WhereYouAre city={user.locationLabel} variant="quiet" />}
          notice={stillOut}
          reason={outfit.reason}
          outfitId={outfit.id}
          worn={outfit.status === "worn"}
          preview={preview}
          liked={liked > 0}
          pieces={ordered.map(toPiece)}
          formSrc={hasForm ? `/api/media/mannequin?ids=${encodeURIComponent(ids.join(","))}` : null}
        />
      ) : (
        <div>
          <header className="mb-8">
            <h1 className="text-[32px] leading-tight text-moss">{weekday}</h1>
            <div className="mt-3 max-w-[34ch]">
              <WhereYouAre city={user.locationLabel} variant="quiet" />
            </div>
          </header>
          {stillOut}
          <form action={makeTodayOutfit}>
            <button type="submit" className="btn">
              Make today&rsquo;s look
            </button>
          </form>
        </div>
      )}
      {ideas.length ? <ShopIdeas ideas={ideas} compact /> : null}
    </Shell>
  );
}
