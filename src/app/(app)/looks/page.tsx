import { LookDeck } from "@/components/look-deck";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { LOOK_SCENARIOS } from "@/lib/occasion";
import { getLookDeck } from "@/lib/looks";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function LooksPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const user = await getCurrentUser();
  const { for: slug } = await searchParams;
  const deck = await getLookDeck(user, slug);

  return (
    <Shell bleed>
      <PageIntro title="Looks">
        <p>
          Like the pairing, not the forecast. Weather is off while you train the closet. Hot, cold,
          and beach still mean those days.
        </p>
      </PageIntro>
      <LookDeck
        looks={deck.looks}
        scenario={deck.scenario.slug}
        scenarios={LOOK_SCENARIOS.map((row) => ({ slug: row.slug, label: row.label }))}
      />
    </Shell>
  );
}
