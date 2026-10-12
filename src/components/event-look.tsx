"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { dressForEvent, sendEventToPhone, skipEventOutfit } from "@/app/actions";
import { PhoneNotify } from "@/components/phone-notify";
import { TextLookButton } from "@/components/text-look-button";
import { clothFacts, clothName } from "@/lib/names";
import { LookPhotos } from "@/components/look-photos";

type Piece = {
  id: string;
  name: string;
  category: string;
  material: string | null;
  warmth: number;
};

function Submit({
  children,
  className,
  pendingLabel,
}: {
  children: string;
  className?: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className ?? "btn"} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

function pickHero(pieces: Piece[]) {
  return (
    pieces.find((piece) => piece.category === "outer") ??
    pieces.find((piece) => piece.category === "top") ??
    pieces[0]
  );
}

export function EventLook({
  scenario,
  readAs,
  forecastAt,
  reason,
  pieces,
}: {
  scenario: string;
  /** What the line was read as: "casual, at night, in the cold". */
  readAs: string;
  /** Where the forecast was read, when the line named a place that is not home. */
  forecastAt: string;
  reason: string;
  pieces: Piece[];
}) {
  const [query, setQuery] = useState(scenario);
  const hero = pickHero(pieces);

  return (
    <div>
      <form action={dressForEvent} className="mb-10 max-w-lg">
        <label className="flex flex-col gap-2 text-[12px] text-mute">
          What’s happening
          <input
            name="scenario"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Dinner tomorrow, late night studying, Boston on Friday…"
            className="field"
            required
          />
        </label>
        <Submit pendingLabel="Looking" className="btn mt-4">
          Dress me for this
        </Submit>
      </form>

      {hero ? (
        <article>
          <LookPhotos pieces={pieces} />
          <p className="mt-8 max-w-[38em] text-[17px] leading-relaxed">{reason}</p>
          {readAs ? (
            <p className="mt-3 text-[12px] text-mute">
              Read as {readAs}.{forecastAt ? ` Forecast for ${forecastAt}.` : ""}
            </p>
          ) : null}
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {pieces.map((piece) => (
              <li key={piece.id} className="flex items-center gap-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/media/item/${piece.id}?v=4`}
                  alt={piece.name}
                  className="h-16 w-12 object-cover"
                />
                <div>
                  <p className="text-[13px]">{clothName(piece.name, piece.material)}</p>
                  <p className="text-[12px] text-mute">
                    {clothFacts({ warmth: piece.warmth, category: piece.category })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <TextLookButton action={sendEventToPhone} />
            <form action={skipEventOutfit}>
              <input type="hidden" name="scenario" value={query} />
              <Submit pendingLabel="Looking" className="btn btn-ghost">
                Not this
              </Submit>
            </form>
          </div>
          <PhoneNotify />
        </article>
      ) : null}
    </div>
  );
}
