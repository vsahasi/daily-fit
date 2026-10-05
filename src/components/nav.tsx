"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Closet" },
  { href: "/today", label: "Today" },
  { href: "/looks", label: "Looks" },
  { href: "/event", label: "Event" },
  { href: "/wash", label: "Wash" },
  { href: "/settings", label: "Account" },
];

/** Pages reached from Account rather than the bar. They light up Account while open. */
const underAccount = ["/style", "/shop"];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      prefetch={true}
      className={active ? "text-ink" : "text-mute hover:text-ink"}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

export function Nav({ city }: { city: string | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 h-[52px] border-b border-line bg-paper">
      <div className="mx-auto flex h-full max-w-[1280px] items-center gap-7 px-6">
        <Link href="/" prefetch={true} className="logo shrink-0">
          Daily Fit
        </Link>
        <Link
          href="/today"
          prefetch={true}
          className="min-w-0 flex-1 truncate text-[13px] text-mute hover:text-ink"
          title={city ?? "Set location"}
        >
          {city ?? "Where are you?"}
        </Link>
        <nav className="flex shrink-0 flex-wrap justify-end gap-x-7 gap-y-1 text-[13px]">
          {links.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              active={
                pathname === link.href ||
                (link.href === "/looks" && pathname.startsWith("/looks")) ||
                (link.href === "/settings" && underAccount.includes(pathname))
              }
            />
          ))}
        </nav>
      </div>
    </header>
  );
}
