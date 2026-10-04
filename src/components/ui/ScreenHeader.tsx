import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "./icons";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backId?: string;
  right?: ReactNode;
}

export function ScreenHeader({ title, subtitle, backHref, backId, right }: ScreenHeaderProps) {
  return (
    <header className="flex items-center gap-3 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {backHref ? (
        <Link
          id={backId}
          href={backHref}
          aria-label="Back"
          className="glass grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg text-muted transition hover:text-fg"
        >
          <ArrowLeftIcon />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold text-fg">{title}</h1>
        {subtitle ? <p className="truncate text-sm text-muted">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  );
}
