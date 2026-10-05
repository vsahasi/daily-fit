"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { dressForEvent, sendEventToPhone, skipEventOutfit } from "@/app/actions";
import { PhoneNotify } from "@/components/phone-notify";
import { TextLookButton } from "@/components/text-look-button";
import { clothFacts, clothName } from "@/lib/names";

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
  reason,
  pieces,
}: {
  scenario: string;
  reason: string;
  pieces: Piece[];
}) {
  const [query, setQuery] = useState(scenario);
  const hero = pickHero(pieces);
  const companion = hero ? pieces.find((piece) => piece.id !== hero.id) ?? null : null;

  return (
    <div>
      <form action={dressForEvent} className="mb-10 max-w-lg">
        <label className="flex flex-col gap-2 text-[12px] text-mute">
          What’s happening
          <input
            name="scenario"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Dinner tomorrow, an interview, the gym…"
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
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <figure className="bg-snow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/item/${hero.id}?v=4`}
                alt={hero.name}
                className="aspect-[3/4] w-full object-cover"
              />
            </figure>
            {companion ? (
              <figure className="bg-snow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/media/item/${companion.id}?v=4`}
                  alt={companion.name}
                  className="aspect-[3/4] w-full object-cover"
                />
              </figure>
            ) : null}
          </div>
          <p className="mt-8 max-w-[38em] text-[17px] leading-relaxed">{reason}</p>
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
                  <p className="text-[12px] text-mute">{clothFacts({ warmth: piece.warmth })}</p>
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
