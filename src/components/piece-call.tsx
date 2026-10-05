"use client";

import { useFormStatus } from "react-dom";
import { decideWornPiece } from "@/app/actions";

type Decision = "wash" | "keep";

function Choice({ label, on }: { label: string; on: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="call" data-on={on} aria-pressed={on} disabled={pending}>
      {label}
    </button>
  );
}

/** The hamper call on one worn piece: wash it, or it is still good to wear again. */
export function PieceCall({
  outfitId,
  itemId,
  decision,
}: {
  outfitId: string;
  itemId: string;
  decision: Decision | null;
}) {
  const choices: { value: Decision; label: string }[] = [
    { value: "wash", label: "Wash" },
    { value: "keep", label: "Still good" },
  ];
  return (
    <div className="mt-1 flex gap-5">
      {choices.map((choice) => (
        <form key={choice.value} action={decideWornPiece}>
          <input type="hidden" name="outfitId" value={outfitId} />
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="choice" value={choice.value} />
          <Choice label={choice.label} on={decision === choice.value} />
        </form>
      ))}
    </div>
  );
}
