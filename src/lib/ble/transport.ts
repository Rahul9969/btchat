import type { Frame } from "./frames";

/** Identifies a connected device. A Member always uses HOST_PEER_ID for its Host. */
export type PeerId = string;

export type TransportKind = "mock" | "web-bluetooth" | "native";

/** Content of the GROUP_INFO characteristic. */
export interface GroupInfo {
  groupId: string;
  groupName: string;
  memberCount: number;
}

export interface DiscoveredGroup {
  groupId: string;
  groupName: string;
  /** dBm. Null when the platform does not report it (MockTransport, browser chooser). */
  rssi: number | null;
}

export interface TransportCapabilities {
  canHost: boolean;
  canJoin: boolean;
  /**
   * False when the platform shows its own device chooser (Web Bluetooth).
   * Then `scan` resolves after the user picks one device.
   */
  listsGroups: boolean;
}

export type FrameListener = (frame: Frame, from: PeerId) => void;

export type PeerEvent =
  | { type: "connected"; peerId: PeerId }
  | { type: "disconnected"; peerId: PeerId };

export type PeerListener = (event: PeerEvent) => void;

export type Unsubscribe = () => void;

export interface ScanSession {
  stop(): void;
}

export interface Transport {
  readonly kind: TransportKind;
  readonly capabilities: TransportCapabilities;

  /** Host role. Starts the GATT server and advertises the service UUID. */
  startAdvertising(group: GroupInfo): Promise<void>;
  /** Host role. Updates GROUP_INFO (for example the member count) while advertising. */
  updateGroupInfo(group: GroupInfo): Promise<void>;
  stopAdvertising(): Promise<void>;

  /** Member role. Calls `onFound` for each Group in range until `stop()`. */
  scan(onFound: (group: DiscoveredGroup) => void): Promise<ScanSession>;
  /** Member role. Connects, subscribes to TX, and reads GROUP_INFO. */
  connect(groupId: string): Promise<GroupInfo>;

  /**
   * Host: sends to `to`, or to all connected Members when `to` is omitted.
   * Member: always sends to the Host; `to` is ignored.
   */
  send(frame: Frame, to?: PeerId[]): Promise<void>;
  onFrame(callback: FrameListener): Unsubscribe;
  onPeerEvent(callback: PeerListener): Unsubscribe;

  /** Closes all connections and stops advertising. */
  disconnect(): Promise<void>;
}

export function notImplemented(part: string): never {
  throw new Error(`NOT IMPLEMENTED: ${part}`);
}
