"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "Discover", icon: "compass", match: (p) => p === "/" || p.startsWith("/trip") },
  { href: "/saved", label: "Saved", icon: "bookmark", match: (p) => p.startsWith("/saved") },
  { href: "/profile", label: "Travelers", icon: "user", match: (p) => p.startsWith("/profile") },
  { href: "/how-it-works", label: "How it works", icon: "info", match: (p) => p.startsWith("/how-it-works") },
];

export function TabBar() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={t.match(pathname) ? "page" : undefined}>
            <Icon name={t.icon} size={22} />
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
