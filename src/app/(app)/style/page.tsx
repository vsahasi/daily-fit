import { refreshMyStyle } from "@/app/actions";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseStyle } from "@/lib/style";
import { buildTaste } from "@/lib/taste";
import { getCurrentUser } from "@/lib/user";
import { wearHistory } from "@/lib/wear";

export const dynamic = "force-dynamic";

export default async function StylePage() {
  const user = await getCurrentUser();
  const style = parseStyle(user.styleProfile);
  const [items, votes, history] = await Promise.all([
    prisma.item.findMany({ where: { userId: user.id, NOT: { imagePath: "" } } }),
    prisma.lookVote.findMany({ where: { userId: user.id } }),
    wearHistory(user.id, todayInZone(user.timezone)),
  ]);
  const taste = buildTaste(items, votes, history.signals);
  const wornLine =
    taste.worn === 0 ? "" : ` And ${taste.worn} ${taste.worn === 1 ? "look" : "looks"} you actually wore, which count double.`;

  return (
    <Shell>
      <div className="max-w-2xl">
        <PageIntro title="Style">
          <p>
            {taste.votes
              ? `From ${taste.likes} likes and ${taste.passes} passes on Looks.${wornLine}`
              : "Updates when you add clothes, swipe Looks, or confirm a look on Today."}
          </p>
        </PageIntro>
        {taste.assumptions.length ? (
          <section className="mb-12">
            <h2 className="text-[18px]">What actually looks good</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-relaxed">
              {taste.assumptions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {style ? (
          <div className="flex flex-col gap-8">
            <p className="text-[16px] leading-relaxed">{style.summary}</p>
            <div className="grid gap-8 sm:grid-cols-2">
              <section>
                <h2 className="font-sans text-[12px] tracking-[-0.01em] text-mute">Palette</h2>
                <p className="mt-1">{style.palette.join(", ")}</p>
              </section>
              <section>
                <h2 className="font-sans text-[12px] tracking-[-0.01em] text-mute">Silhouettes</h2>
                <p className="mt-1">{style.silhouettes.join(", ")}</p>
              </section>
            </div>
            <section>
              <h2 className="font-sans text-[12px] tracking-[-0.01em] text-mute">Lean into</h2>
              <ul className="mt-2 space-y-1">
                {style.do.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="font-sans text-[12px] tracking-[-0.01em] text-mute">Skip</h2>
              <ul className="mt-2 space-y-1">
                {style.dont.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <p className="text-mute">{style.formality}</p>
          </div>
        ) : taste.assumptions.length === 0 ? (
          <p className="text-[14px] text-mute">Add a few pieces. Style shows up once there is something to read.</p>
        ) : null}
        <form action={refreshMyStyle} className="mt-10">
          <button type="submit" className="btn btn-ghost">
            Refresh style
          </button>
        </form>
      </div>
    </Shell>
  );
}
