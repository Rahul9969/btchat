import { MockTransport } from "./mockTransport";
import { DaemonTransport } from "./daemonTransport";
import { notImplemented, type Transport, type TransportCapabilities, type TransportKind } from "./transport";

const KINDS: readonly TransportKind[] = ["mock", "web-bluetooth", "native"];

export const TRANSPORT_LABELS: Record<TransportKind, string> = {
  mock: "Mock (BroadcastChannel)",
  "web-bluetooth": "Web Bluetooth",
  native: "AirDrop-X Native",
};

export const TRANSPORT_CAPABILITIES: Record<TransportKind, TransportCapabilities> = {
  mock: { canHost: true, canJoin: true, listsGroups: true },
  "web-bluetooth": { canHost: false, canJoin: true, listsGroups: false },
  native: { canHost: true, canJoin: true, listsGroups: true },
};

function isTransportKind(value: string | undefined): value is TransportKind {
  return KINDS.includes(value as TransportKind);
}

/**
 * Picks the Transport. Set NEXT_PUBLIC_TRANSPORT to force one.
 * Phase 1 defaults to "mock"; later phases add detection of Capacitor and Web Bluetooth.
 */
export function selectTransportKind(): TransportKind {
  const forced = process.env.NEXT_PUBLIC_TRANSPORT;
  return isTransportKind(forced) ? forced : "native";
}

function createTransport(kind: TransportKind): Transport {
  return new DaemonTransport();
}

let instance: Transport | null = null;

/** One Transport per page lifetime. UI code gets the Transport only through this function. */
export function getTransport(): Transport {
  instance ??= createTransport(selectTransportKind());
  return instance;
}
