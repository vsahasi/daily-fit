import { refreshMyStyle } from "@/app/actions";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { todayInZone } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { parseStyle } from "@/lib/style";
import { getCurrentUser } from "@/lib/user";
import { wearHistory } from "@/lib/wear";

export const dynamic = "force-dynamic";

export default async function StylePage() {
  const user = await getCurrentUser();
  const style = parseStyle(user.styleProfile);
  const [liked, history] = await Promise.all([
    prisma.lookVote.count({ where: { userId: user.id, verdict: "like" } }),
    wearHistory(user.id, todayInZone(user.timezone)),
  ]);
  const worn = history.worn.length;
  const wornLine = worn === 0 ? "" : ` And ${worn} ${worn === 1 ? "look" : "looks"} you actually wore.`;

  return (
    <Shell>
      <div className="max-w-2xl">
        <PageIntro title="Style">
          <p>
            {liked || worn
              ? `From ${liked} ${liked === 1 ? "look" : "looks"} you liked.${wornLine}`
              : "Updates when you add clothes, like a look, or confirm a look on Today."}
          </p>
        </PageIntro>
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
        ) : (
          <p className="text-[14px] text-mute">Add a few pieces. Style shows up once there is something to read.</p>
        )}
        <form action={refreshMyStyle} className="mt-10">
          <button type="submit" className="btn btn-ghost">
            Refresh style
          </button>
        </form>
      </div>
    </Shell>
  );
}
