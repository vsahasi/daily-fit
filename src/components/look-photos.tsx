type Piece = { id: string; name: string; category: string };

/** The order a look is read in: what goes on last is seen first. */
const ORDER: Record<string, number> = { outer: 0, top: 1, bottom: 2, shoes: 3, accessory: 4 };

/**
 * Every piece of a look, side by side: jacket, mid layer, top, trousers, shoes. A layered
 * look is four or five pieces, and all of them are the look.
 */
export function LookPhotos({ pieces, version = 4, draggable }: { pieces: Piece[]; version?: number; draggable?: boolean }) {
  // Outer layers come first with the outermost leading; everything else keeps the order it was stored in.
  const outers = pieces.filter((piece) => piece.category === "outer").reverse();
  const rest = pieces.filter((piece) => piece.category !== "outer");
  const tops = rest.filter((piece) => piece.category === "top");
  // A mid layer cataloged as a top (a hoodie over a tee) sits with the layers, ahead of the base.
  const ordered = [...outers, ...tops.slice(1).reverse(), ...tops.slice(0, 1), ...rest.filter((piece) => piece.category !== "top")].sort(
    (a, b) => (ORDER[a.category] ?? 9) - (ORDER[b.category] ?? 9),
  );
  const columns =
    ordered.length <= 2 ? "grid-cols-2" : ordered.length === 3 ? "grid-cols-3" : ordered.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-5";
  return (
    <div className={`grid gap-2 ${columns}`}>
      {ordered.map((piece) => (
        <figure key={piece.id} className="bg-snow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/media/item/${piece.id}?v=${version}`}
            alt={piece.name}
            className="aspect-[3/4] w-full object-cover"
            draggable={draggable}
          />
        </figure>
      ))}
    </div>
  );
}
