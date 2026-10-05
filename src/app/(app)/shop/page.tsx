import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { ShopIdeas } from "@/components/shop-ideas";

export default function ShopPage() {
  return (
    <Shell>
      <div className="max-w-2xl">
        <PageIntro title="New">
          <p>
            Pieces that fill holes without changing the closet’s personality. Stay in-lane: henleys,
            work pants, street mixed with older stuff.
          </p>
        </PageIntro>
        <ShopIdeas />
      </div>
    </Shell>
  );
}
