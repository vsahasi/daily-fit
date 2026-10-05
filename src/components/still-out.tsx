import { PieceCall } from "@/components/piece-call";
import { clothName } from "@/lib/names";

type Piece = { outfitId: string; id: string; name: string; material: string | null };

/** Pieces worn on earlier days that nobody has called wash-or-keep on yet. */
export function StillOut({ pieces }: { pieces: Piece[] }) {
  if (!pieces.length) return null;
  return (
    <section className="mb-10" aria-labelledby="still-out">
      <h2 id="still-out" className="text-[18px]">
        Worn, and still out
      </h2>
      <p className="mt-1 max-w-[42ch] text-[13px] text-mute">
        Wash what is dirty. The rest goes back in rotation.
      </p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {pieces.map((piece) => (
          <li key={piece.id} className="flex items-center gap-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/media/item/${piece.id}?v=4`}
              alt=""
              className="h-16 w-12 object-cover"
            />
            <div>
              <p className="text-[13px]">{clothName(piece.name, piece.material)}</p>
              <PieceCall outfitId={piece.outfitId} itemId={piece.id} decision={null} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
