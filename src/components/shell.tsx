import type { ReactNode } from "react";

export function Shell({
  children,
  bleed = false,
}: {
  children: ReactNode;
  bleed?: boolean;
}) {
  return (
    <div className={bleed ? "w-full px-6 py-8" : "mx-auto w-full max-w-[1280px] px-6 py-8"}>
      {children}
    </div>
  );
}
