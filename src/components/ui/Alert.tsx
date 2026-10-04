import type { ReactNode } from "react";
import { AlertIcon, InfoIcon } from "./icons";

type AlertTone = "error" | "warning" | "info";

const tones: Record<AlertTone, string> = {
  error: "border-rose/30 bg-rose/10 text-rose",
  warning: "border-amber/30 bg-amber/10 text-amber",
  info: "border-cyan/25 bg-cyan/10 text-cyan",
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function Alert({ tone = "error", title, children, action }: AlertProps) {
  const Icon = tone === "info" ? InfoIcon : AlertIcon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex animate-fade-up items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}
    >
      <Icon className="mt-0.5 shrink-0 text-base" />
      <div className="flex-1 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-fg/80">{children}</div>
      </div>
      {action}
    </div>
  );
}
