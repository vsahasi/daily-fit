"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { voteLook } from "@/app/actions";
import { clothName } from "@/lib/names";
import type { LookCard } from "@/lib/looks";
import { LookPhotos } from "@/components/look-photos";

const PHOTO = 4;

type Scenario = { slug: string; label: string };

function pickHero(pieces: LookCard["pieces"]) {
  return pieces.find((piece) => piece.category === "top") ?? pieces[0];
}

/**
 * A stack to swipe on the couch. It stays fast on purpose: clothes only, no rendered
 * form. The one form worth waiting for is on Today, for the look actually being worn.
 */
export function LookDeck({
  looks,
  scenario,
  scenarios,
}: {
  looks: LookCard[];
  scenario: string;
  scenarios: Scenario[];
}) {
  const [stack, setStack] = useState(looks);
  const [source, setSource] = useState(looks);
  if (source !== looks) {
    // A new deck arrived from the server (another scenario, or a refresh).
    setSource(looks);
    setStack(looks);
  }
  const startX = useRef<number | null>(null);
  const current = stack[0];

  const decide = useCallback(
    async (verdict: "like" | "pass") => {
      if (!current) return;
      setStack((rows) => rows.slice(1));
      await voteLook(current.itemIds, verdict, current.scenario);
    },
    [current],
  );

  function onPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest("button, a")) return;
    startX.current = event.clientX;
  }

  function onPointerUp(event: PointerEvent) {
    if (startX.current == null) return;
    const dx = event.clientX - startX.current;
    startX.current = null;
    if (dx > 72) void decide("like");
    if (dx < -72) void decide("pass");
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") void decide("like");
      if (event.key === "ArrowLeft") void decide("pass");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  const hero = current ? pickHero(current.pieces) : null;

  return (
    <div>
      <nav className="mb-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        {scenarios.map((row) => (
          <Link
            key={row.slug}
            href={row.slug === "everyday" ? "/looks" : `/looks?for=${row.slug}`}
            className={row.slug === scenario ? "text-ink" : "text-mute hover:text-ink"}
            aria-current={row.slug === scenario ? "page" : undefined}
          >
            {row.label}
          </Link>
        ))}
      </nav>

      {current && hero ? (
        <article className="select-none" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <LookPhotos pieces={current.pieces} version={PHOTO} draggable={false} />

          <ul className="mt-8 space-y-1">
            {current.pieces.map((piece) => (
              <li key={piece.id} className="text-[16px] leading-relaxed">
                {clothName(piece.name, piece.material)}
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-[38em] text-[14px] leading-[22px] text-mute">{current.reason}</p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button type="button" className="btn btn-ghost" onClick={() => void decide("pass")}>
              Pass
            </button>
            <button type="button" className="btn" onClick={() => void decide("like")}>
              Like
            </button>
          </div>
          <p className="mt-8 text-[12px] text-mute">
            {stack.length} left. Swipe right to like, left to pass.
          </p>
        </article>
      ) : (
        <p className="max-w-[36em] text-[16px] leading-relaxed">
          That’s this stack. Open another kind of day, or come back after you add clothes.
        </p>
      )}
    </div>
  );
}
