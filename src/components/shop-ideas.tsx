"use client";

import { useState } from "react";
import { getShopIdeas } from "@/app/actions";

type Idea = { item: string; why: string; search: string };

export function ShopIdeas() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    try {
      setIdeas(await getShopIdeas());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not suggest pieces");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void run()} disabled={busy} className="btn">
        {busy ? "Looking at the closet…" : "Suggest three pieces"}
      </button>
      {error ? <p className="mt-4 text-[13px] text-warn">{error}</p> : null}
      {ideas ? (
        <ul className="mt-10 divide-y divide-line border-t border-line">
          {ideas.map((idea) => (
            <li key={idea.item} className="py-6">
              <h2 className="font-sans text-[16px] tracking-[-0.01em]">{idea.item}</h2>
              <p className="mt-2 text-[13px] text-mute">{idea.why}</p>
              <p className="mt-3 text-[12px]">Search: {idea.search}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
