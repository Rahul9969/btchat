import type { TransportKind } from "./transport";

export type SupportStatus = { supported: true } | { supported: false; reason: string };

interface BluetoothAvailability {
  getAvailability?: () => Promise<boolean>;
}

function checkMockSupport(): SupportStatus {
  if (typeof BroadcastChannel === "undefined") {
    return { supported: false, reason: "This browser has no BroadcastChannel, so the mock Transport cannot run." };
  }
  return { supported: true };
}

async function checkWebBluetoothSupport(): Promise<SupportStatus> {
  if (!window.isSecureContext) {
    return { supported: false, reason: "Web Bluetooth needs HTTPS or localhost. This page is not in a secure context." };
  }
  const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothAvailability }).bluetooth;
  if (!bluetooth) {
    return {
      supported: false,
      reason: "This browser has no Web Bluetooth. Use Chrome or Edge on desktop or Android. iOS and Firefox do not support it.",
    };
  }
  if (bluetooth.getAvailability && !(await bluetooth.getAvailability())) {
    return { supported: false, reason: "No Bluetooth adapter was found, or Bluetooth is turned off." };
  }
  return { supported: true };
}

/** Run-time check. Call only in the browser (for example inside useEffect). */
export async function checkTransportSupport(kind: TransportKind): Promise<SupportStatus> {
  if (typeof window === "undefined") return { supported: false, reason: "Not running in a browser." };
  switch (kind) {
    case "mock":
      return checkMockSupport();
    case "web-bluetooth":
      return checkWebBluetoothSupport();
    case "native":
      return { supported: false, reason: "NOT IMPLEMENTED: native BLE support check (Phase 6)." };
  }
}
