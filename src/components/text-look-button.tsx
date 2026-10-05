"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

export type TextResult = { ok: boolean; message: string } | null;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost" disabled={pending}>
      {pending ? "Sending" : "Send to my phone"}
    </button>
  );
}

export function TextLookButton({
  action,
}: {
  action: (
    prev: TextResult,
    formData: FormData,
  ) => Promise<{ ok: boolean; message: string }>;
}) {
  const [state, formAction] = useActionState(action, null as TextResult);
  return (
    <div>
      <form action={formAction}>
        <Submit />
      </form>
      {state?.message ? (
        <p className={`mt-2 text-[13px] ${state.ok ? "text-mute" : "text-warn"}`}>{state.message}</p>
      ) : null}
    </div>
  );
}
