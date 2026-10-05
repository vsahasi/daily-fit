import { deleteItem, putItemInWash, markItemClean } from "@/app/actions";
import { clothFacts, clothName } from "@/lib/names";

type ItemCardProps = {
  id: string;
  name: string;
  category: string;
  material: string | null;
  warmth: number;
  status: string;
  /** "Worn yesterday" and the like, for pieces worn in the last week. */
  worn: string | null;
};

export function ItemCard({ id, name, category, material, warmth, status, worn }: ItemCardProps) {
  const inWash = status === "wash";
  const facts = [clothFacts({ warmth, inWash, category }), worn].filter(Boolean).join(". ");
  return (
    <article>
      <div className="bg-snow">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/item/${id}?v=4`}
          alt={name}
          className={`aspect-[3/4] w-full object-cover ${inWash ? "opacity-40" : ""}`}
        />
      </div>
      <div className="pt-3">
        <h2 className="font-sans text-[13px] leading-snug tracking-[-0.01em]">
          {clothName(name, material)}
        </h2>
        <p className="text-[12px] text-mute">{facts}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-mute">
          {inWash ? (
            <form action={markItemClean.bind(null, id)}>
              <button type="submit" className="hover:text-ink">
                Mark clean
              </button>
            </form>
          ) : category === "shoes" ? null : (
            <form action={putItemInWash} className="flex items-center gap-2">
              <input type="hidden" name="itemId" value={id} />
              <button type="submit" className="hover:text-ink">
                Wash
              </button>
              <select name="days" defaultValue="2" className="bg-transparent text-[12px]">
                <option value="1">1 day</option>
                <option value="2">2 days</option>
                <option value="3">3 days</option>
                <option value="5">5 days</option>
                <option value="7">a week</option>
              </select>
            </form>
          )}
          <form action={deleteItem.bind(null, id)}>
            <button type="submit" className="hover:text-ink">
              Remove
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
