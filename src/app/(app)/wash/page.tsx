import { didLaundry, markItemClean } from "@/app/actions";
import { PageIntro } from "@/components/page-intro";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import { clothName } from "@/lib/names";
import { getCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function WashPage() {
  const user = await getCurrentUser();
  const items = await prisma.item.findMany({
    where: { userId: user.id, status: "wash" },
    orderBy: { washUntil: "asc" },
  });

  return (
    <Shell>
      <PageIntro
        title="Wash"
        action={
          items.length > 0 ? (
            <form action={didLaundry}>
              <button type="submit" className="btn">
                I did laundry
              </button>
            </form>
          ) : null
        }
      >
        <p>
          Nothing goes in the wash unless you put it there. On Today, wash the pieces you actually
          dirtied and leave the rest. They stay out of the closet until you mark them clean.
        </p>
      </PageIntro>
      {items.length === 0 ? (
        <p className="text-[14px] text-mute">Nothing in the wash.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-3 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <div className="bg-snow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/media/item/${item.id}?v=4`}
                  alt={item.name}
                  className="aspect-[3/4] w-full object-cover opacity-45"
                />
              </div>
              <p className="pt-3 text-[13px]">{clothName(item.name, item.material)}</p>
              <p className="text-[12px] text-mute">In the wash</p>
              <form action={markItemClean.bind(null, item.id)}>
                <button type="submit" className="text-[12px] text-mute hover:text-ink">
                  Mark clean
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
