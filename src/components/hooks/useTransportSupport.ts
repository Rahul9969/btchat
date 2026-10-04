"use client";

import { useEffect, useState } from "react";
import { checkTransportSupport, type SupportStatus } from "@/lib/ble/support";
import type { TransportKind } from "@/lib/ble/transport";
import { selectTransportKind, TRANSPORT_CAPABILITIES, TRANSPORT_LABELS } from "@/lib/ble/transportFactory";

export interface TransportSupport {
  kind: TransportKind;
  label: string;
  canHost: boolean;
  canJoin: boolean;
  listsGroups: boolean;
  /** Null while the check runs. */
  status: SupportStatus | null;
}

/** Runs the Bluetooth support check once in the browser. */
export function useTransportSupport(): TransportSupport {
  const kind = selectTransportKind();
  const [status, setStatus] = useState<SupportStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkTransportSupport(kind)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus({ supported: false, reason: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return { kind, label: TRANSPORT_LABELS[kind], ...TRANSPORT_CAPABILITIES[kind], status };
}
