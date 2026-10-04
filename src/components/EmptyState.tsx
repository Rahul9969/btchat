import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  pulsing?: boolean;
}

export function EmptyState({ icon, title, children, action, pulsing = false }: EmptyStateProps) {
  return (
    <div className="flex animate-fade-up flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-6 grid h-20 w-20 place-items-center">
        {pulsing ? (
          <>
            <span className="absolute inset-0 animate-ping-slow rounded-full border border-cyan/40" />
            <span
              className="absolute inset-0 animate-ping-slow rounded-full border border-violet/40"
              style={{ animationDelay: "1.2s" }}
            />
          </>
        ) : null}
        <span className="glass relative grid h-16 w-16 place-items-center rounded-full text-2xl text-cyan">{icon}</span>
      </div>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <div className="mt-1 max-w-xs text-sm text-muted">{children}</div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
