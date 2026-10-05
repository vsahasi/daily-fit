"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  likeTodayOutfit,
  makeTodayOutfit,
  putItemInWash,
  sendTodayToPhone,
  skipTodayOutfit,
  swapTodayPiece,
  unlikeTodayOutfit,
  unwearTodayOutfit,
  wearTodayOutfit,
} from "@/app/actions";
import { PhoneNotify } from "@/components/phone-notify";
import { PieceCall } from "@/components/piece-call";
import { TextLookButton } from "@/components/text-look-button";
import { clothFacts, clothName } from "@/lib/names";
import { LookPhotos } from "@/components/look-photos";

type Piece = {
  id: string;
  name: string;
  category: string;
  material: string | null;
  warmth: number;
  decision: "wash" | "keep" | null;
  /** Another clean piece exists for this slot. */
  canSwap?: boolean;
};

function Submit({
  children,
  className,
  pendingLabel,
}: {
  children: string;
  className: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function LookSpread({
  weekday,
  dek,
  place,
  notice,
  reason,
  outfitId,
  worn,
  liked,
  pieces,
  formSrc: cachedFormSrc,
  preview = false,
}: {
  /** Tomorrow's look, seen the evening before: it can be changed, not yet worn. */
  preview?: boolean;
  weekday: string;
  dek: string;
  place: ReactNode;
  /** Shown under the header, ahead of the look. Today uses it for pieces still out. */
  notice?: ReactNode;
  reason: string;
  outfitId: string;
  worn: boolean;
  /** The user has said they like this stack. A nudge for later, not a request for a repeat. */
  liked: boolean;
  pieces: Piece[];
  /** Set when this exact stack already has a rendered form in storage. */
  formSrc: string | null;
}) {
  const [formSrc, setFormSrc] = useState(cachedFormSrc);
  const [showForm, setShowForm] = useState(Boolean(cachedFormSrc));
  const [dressing, setDressing] = useState(false);
  const [formError, setFormError] = useState("");

  async function dressForm() {
    if (formSrc) {
      setShowForm(true);
      return;
    }
    setDressing(true);
    setFormError("");
    try {
      const itemIds = pieces.map((piece) => piece.id);
      const response = await fetch("/api/media/mannequin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      if (!response.ok) throw new Error("Could not dress a form");
      setFormSrc(`/api/media/mannequin?ids=${encodeURIComponent(itemIds.join(","))}`);
      setShowForm(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not dress a form");
    } finally {
      setDressing(false);
    }
  }

  // Every form says which look it was shown and which day it belongs to.
  const lookFields = (
    <>
      <input type="hidden" name="outfitId" value={outfitId} />
      {preview ? <input type="hidden" name="day" value="tomorrow" /> : null}
    </>
  );

  return (
    <article>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] leading-tight text-moss">{weekday}</h1>
          {worn ? <p className="mt-1 text-[14px] text-moss">Wearing this today.</p> : null}
          {preview ? (
            <p className="mt-1 text-[14px] text-mute">
              Tomorrow&rsquo;s look.{" "}
              <a href="/today" className="text-ink underline-offset-4 hover:underline">
                See today
              </a>
            </p>
          ) : null}
        </div>
        <div className="max-w-[34ch] text-[14px] leading-[22px]">
          <p>{dek}</p>
          <div className="mt-1">{place}</div>
        </div>
      </header>

      {notice}

      {showForm && formSrc ? (
        <figure className="bg-snow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={formSrc} alt="This look on a form" className="mx-auto max-h-[80vh] w-full object-contain" />
        </figure>
      ) : (
        <LookPhotos pieces={pieces} />
      )}

      <p className="mt-8 max-w-[38em] text-[17px] leading-relaxed">{reason}</p>

      <h2 className="mt-10 text-[18px]">{worn ? "What goes in the wash?" : "In this look"}</h2>
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
              <p className="text-[12px] text-mute">
                {clothFacts({ warmth: piece.warmth, category: piece.category })}
              </p>
              {worn ? (
                piece.category === "shoes" ? null : (
                  <PieceCall outfitId={outfitId} itemId={piece.id} decision={piece.decision} />
                )
              ) : (
                <div className="mt-1 flex gap-5">
                  {piece.canSwap === false ? null : (
                    <form action={swapTodayPiece}>
              {lookFields}
                      <input type="hidden" name="itemId" value={piece.id} />
                      <Submit className="call" pendingLabel="Swapping">
                        Swap
                      </Submit>
                    </form>
                  )}
                  {piece.category === "shoes" ? null : (
                    <form action={putItemInWash}>
                      <input type="hidden" name="itemId" value={piece.id} />
                      <Submit className="call" pendingLabel="Finding another look">
                        Already dirty
                      </Submit>
                    </form>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
        {worn ? (
          <form action={unwearTodayOutfit}>
              {lookFields}
            <Submit className="btn btn-ghost" pendingLabel="Undoing">
              Didn&rsquo;t wear it
            </Submit>
          </form>
        ) : (
          <>
            {preview ? null : (
              <form action={wearTodayOutfit}>
                {lookFields}
                <Submit className="btn" pendingLabel="Noting it">
                  Wearing this
                </Submit>
              </form>
            )}
            <form action={skipTodayOutfit}>
              {lookFields}
              <Submit className="btn btn-ghost" pendingLabel="Looking">
                Not this
              </Submit>
            </form>
            <form action={makeTodayOutfit}>
              {lookFields}
              <Submit className="btn btn-text" pendingLabel="Looking">
                Another look
              </Submit>
            </form>
          </>
        )}
        <button
          type="button"
          className="btn btn-text"
          disabled={dressing}
          onClick={() => (showForm ? setShowForm(false) : void dressForm())}
        >
          {dressing ? "Dressing a form, about a minute" : showForm ? "Clothes only" : "On a form"}
        </button>
      </div>
      {formError ? <p className="mt-3 text-[13px] text-warn">{formError}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        {liked ? (
          <>
            <p className="text-moss">You like this look. More like it, later, in a new mix.</p>
            <form action={unlikeTodayOutfit}>
              {lookFields}
              <Submit className="btn btn-text" pendingLabel="Undoing">
                Undo
              </Submit>
            </form>
          </>
        ) : (
          <form action={likeTodayOutfit}>
              {lookFields}
            <Submit className="btn btn-ghost" pendingLabel="Noting it">
              I like this look
            </Submit>
          </form>
        )}
      </div>

      {preview ? null : (
        <div className="mt-8">
          <TextLookButton action={sendTodayToPhone} />
          <PhoneNotify />
        </div>
      )}
    </article>
  );
}
