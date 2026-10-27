import Link from "next/link";
import type { ReactNode } from "react";

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="STANDBY home">
        <span className="wordmark-dot" />
        STANDBY
      </Link>
      {right}
    </header>
  );
}
