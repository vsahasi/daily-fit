import type { ReactNode } from "react";

type PageIntroProps = {
  kicker?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function PageIntro({ kicker, title, children, action }: PageIntroProps) {
  return (
    <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker ? <p className="mb-2 text-[13px] text-mute">{kicker}</p> : null}
        <h1 className="text-[32px] leading-tight">{title}</h1>
        {children ? <div className="mt-3 max-w-[42ch] text-[14px] leading-[22px] text-mute">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
