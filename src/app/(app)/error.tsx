"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-[32px] leading-tight">Something broke</h1>
      <p className="mt-3 text-[14px] text-mute">
        {error.message.includes("Minified React error")
          ? "Try that again. If it keeps failing, the look is still saved here."
          : error.message}
      </p>
      <button type="button" className="btn mt-8" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
