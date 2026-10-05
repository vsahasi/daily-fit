import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { ShopIdeas } from "@/components/shop-ideas";
import { currentIdeas } from "@/lib/shop";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const user = await getCurrentUser();
  const { note } = await searchParams;
  const ideas = await currentIdeas(user.id, 6);
  return (
    <Shell>
      <div className="max-w-2xl">
        <PageIntro title="New">
          <p>
            Pieces that fill holes without changing the closet&rsquo;s personality. Every Sunday one of
            these arrives as a notification.
          </p>
        </PageIntro>
        {note ? <p className="mb-6 text-[13px] text-warn">{note}</p> : null}
        <ShopIdeas ideas={ideas} />
      </div>
    </Shell>
  );
}
