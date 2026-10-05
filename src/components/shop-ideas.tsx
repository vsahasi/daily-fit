"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { dismissShopIdea, refreshShopIdeas } from "@/app/actions";

export type Idea = { id: string; gap: string; item: string; why: string; search: string };

function Submit({ children, className, pendingLabel }: { children: string; className: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * The box of things worth adding. The gaps are found in code from what the closet cannot
 * do; each idea is one piece that closes one. Compact shows a single idea under a look.
 */
export function ShopIdeas({ ideas, compact = false }: { ideas: Idea[]; compact?: boolean }) {
  const shown = compact ? ideas.slice(0, 1) : ideas;
  return (
    <section className={compact ? "mt-12 border-t border-line pt-8" : ""} aria-labelledby="shop-ideas">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="shop-ideas" className={compact ? "font-sans text-[12px] tracking-[-0.01em] text-mute" : "text-[18px]"}>
            {compact ? "Something new for the closet" : "Worth adding"}
          </h2>
          {compact ? null : (
            <p className="mt-1 max-w-[44ch] text-[13px] text-mute">
              Found from what the closet cannot do yet. One piece per gap, in your lane.
            </p>
          )}
        </div>
        {compact ? (
          <Link href="/shop" className="text-[13px] text-mute underline-offset-4 hover:text-ink hover:underline">
            All ideas
          </Link>
        ) : (
          <form action={refreshShopIdeas}>
            <Submit className="btn btn-ghost" pendingLabel="Looking at the closet…">
              {ideas.length ? "Fresh ideas" : "Find three pieces"}
            </Submit>
          </form>
        )}
      </div>
      {shown.length ? (
        <ul className={compact ? "mt-4" : "mt-8 divide-y divide-line border-t border-line"}>
          {shown.map((idea) => (
            <li key={idea.id} className={compact ? "" : "py-6"}>
              <h3 className="font-sans text-[16px] tracking-[-0.01em]">{idea.item}</h3>
              <p className="mt-2 max-w-[48ch] text-[13px] leading-[20px] text-mute">{idea.why}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
                <a
                  href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(idea.search)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  Search: {idea.search}
                </a>
                <form action={dismissShopIdea}>
                  <input type="hidden" name="id" value={idea.id} />
                  <Submit className="call" pendingLabel="Noted">
                    Not for me
                  </Submit>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : compact ? null : (
        <p className="mt-8 text-[14px] text-mute">Nothing on file yet. Find three pieces and they will show up here, on Closet, and under Today&rsquo;s look.</p>
      )}
    </section>
  );
}
