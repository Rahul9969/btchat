"use client";

import type { TransportSupport } from "./hooks/useTransportSupport";

export function TransportStatus({ support }: { support: TransportSupport }) {
  const { status, label } = support;
  const dot = status === null ? "bg-subtle" : status.supported ? "bg-mint" : "bg-rose";
  const text = status === null ? "Checking…" : status.supported ? "Ready" : "Unavailable";
  return (
    <div
      id="transport-status"
      className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted"
      title={status && !status.supported ? status.reason : label}
    >
      <span className="relative flex h-2 w-2">
        {status?.supported ? <span className={`absolute inset-0 animate-ping-slow rounded-full ${dot}`} /> : null}
        <span className={`relative h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span className="font-medium text-fg/90">{label}</span>
      <span className="text-subtle">·</span>
      <span>{text}</span>
    </div>
  );
}
