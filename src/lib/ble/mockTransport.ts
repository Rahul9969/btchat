import { CONNECT_TIMEOUT_MS, HOST_PEER_ID, MAX_MEMBERS } from "./constants";
import type { Frame } from "./frames";
import { ListenerSet } from "./listeners";
import type {
  DiscoveredGroup,
  FrameListener,
  GroupInfo,
  PeerEvent,
  PeerId,
  PeerListener,
  ScanSession,
  Transport,
  TransportCapabilities,
  Unsubscribe,
} from "./transport";
import { randomId } from "../id";

export const MOCK_CHANNEL_NAME = "btchat-mock-v1";

/**
 * Messages on the BroadcastChannel. Every tab receives every message,
 * so each one carries `from` and (when addressed) `to` to simulate point-to-point links.
 */
type Envelope =
  | { k: "discover"; from: string }
  | { k: "advert"; from: string; group: GroupInfo }
  | { k: "connect"; from: string; groupId: string }
  | { k: "connect-ok"; from: string; to: string; group: GroupInfo }
  | { k: "connect-reject"; from: string; to: string; reason: string }
  | { k: "frame"; from: string; to: string; frame: Frame }
  | { k: "disconnect"; from: string; to: string };

interface PendingConnect {
  groupId: string;
  resolve: (group: GroupInfo) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Development Transport. Two browser tabs on the same origin act as two devices.
 * It does not simulate MTU limits or radio delay.
 */
export class MockTransport implements Transport {
  readonly kind = "mock" as const;
  readonly capabilities: TransportCapabilities = {
    canHost: true,
    canJoin: true,
    listsGroups: true,
  };

  readonly deviceId = randomId(6);
  private readonly channel: BroadcastChannel;
  private readonly frameListeners = new ListenerSet<[Frame, PeerId]>();
  private readonly peerListeners = new ListenerSet<[PeerEvent]>();
  private readonly scanCallbacks = new Set<(group: DiscoveredGroup) => void>();
  private hostedGroup: GroupInfo | null = null;
  private readonly members = new Set<string>();
  private hostDeviceId: string | null = null;
  private pendingConnect: PendingConnect | null = null;

  constructor(channelName: string = MOCK_CHANNEL_NAME) {
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (event: MessageEvent<Envelope>) => this.handle(event.data);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onPageHide);
    }
  }

  async startAdvertising(group: GroupInfo): Promise<void> {
    if (this.hostDeviceId) throw new Error("This device is a Member of another Group.");
    this.hostedGroup = { ...group };
    this.post({ k: "advert", from: this.deviceId, group: this.hostedGroup });
  }

  async updateGroupInfo(group: GroupInfo): Promise<void> {
    if (!this.hostedGroup) throw new Error("Not advertising.");
    this.hostedGroup = { ...group };
  }

  async stopAdvertising(): Promise<void> {
    this.hostedGroup = null;
  }

  async scan(onFound: (group: DiscoveredGroup) => void): Promise<ScanSession> {
    this.scanCallbacks.add(onFound);
    this.post({ k: "discover", from: this.deviceId });
    return { stop: () => this.scanCallbacks.delete(onFound) };
  }

  connect(groupId: string): Promise<GroupInfo> {
    if (this.pendingConnect) return Promise.reject(new Error("A connection is already in progress."));
    if (this.hostedGroup) return Promise.reject(new Error("This device is hosting a Group."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.failConnect("The Host did not answer."), CONNECT_TIMEOUT_MS);
      this.pendingConnect = { groupId, resolve, reject, timer };
      this.post({ k: "connect", from: this.deviceId, groupId });
    });
  }

  async send(frame: Frame, to?: PeerId[]): Promise<void> {
    for (const target of this.resolveTargets(to)) {
      this.post({ k: "frame", from: this.deviceId, to: target, frame });
    }
  }

  onFrame(callback: FrameListener): Unsubscribe {
    return this.frameListeners.add(callback);
  }

  onPeerEvent(callback: PeerListener): Unsubscribe {
    return this.peerListeners.add(callback);
  }

  async disconnect(): Promise<void> {
    this.dropAllLinks();
    this.hostedGroup = null;
    if (this.pendingConnect) this.failConnect("Disconnected.");
  }

  /** Closes the channel. Only for tests; the app keeps one MockTransport for the page lifetime. */
  dispose(): void {
    this.dropAllLinks();
    this.channel.close();
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPageHide);
    }
  }

  private readonly onPageHide = (): void => {
    this.dropAllLinks();
  };

  private resolveTargets(to?: PeerId[]): string[] {
    if (this.hostDeviceId) return [this.hostDeviceId];
    if (!this.hostedGroup) throw new Error("Not connected to a Group.");
    const all = [...this.members];
    return to ? to.filter((peer) => this.members.has(peer)) : all;
  }

  private dropAllLinks(): void {
    const peers = this.hostDeviceId ? [this.hostDeviceId] : [...this.members];
    for (const peer of peers) this.post({ k: "disconnect", from: this.deviceId, to: peer });
    this.members.clear();
    this.hostDeviceId = null;
  }

  private post(envelope: Envelope): void {
    this.channel.postMessage(envelope);
  }

  private handle(envelope: Envelope): void {
    if ("to" in envelope && envelope.to !== this.deviceId) return;
    switch (envelope.k) {
      case "discover":
        return this.answerDiscover();
      case "advert":
        return this.reportAdvert(envelope.group);
      case "connect":
        return this.acceptConnect(envelope.from, envelope.groupId);
      case "connect-ok":
        return this.finishConnect(envelope.from, envelope.group);
      case "connect-reject":
        return this.failConnect(envelope.reason);
      case "frame":
        return this.receiveFrame(envelope.from, envelope.frame);
      case "disconnect":
        return this.receiveDisconnect(envelope.from);
    }
  }

  private answerDiscover(): void {
    if (this.hostedGroup) this.post({ k: "advert", from: this.deviceId, group: this.hostedGroup });
  }

  private reportAdvert(group: GroupInfo): void {
    const found: DiscoveredGroup = { groupId: group.groupId, groupName: group.groupName, rssi: null };
    for (const callback of [...this.scanCallbacks]) callback(found);
  }

  private acceptConnect(from: string, groupId: string): void {
    if (!this.hostedGroup || this.hostedGroup.groupId !== groupId) return;
    if (this.members.size >= MAX_MEMBERS) {
      this.post({ k: "connect-reject", from: this.deviceId, to: from, reason: "The Group is full." });
      return;
    }
    this.members.add(from);
    this.post({ k: "connect-ok", from: this.deviceId, to: from, group: this.hostedGroup });
    this.peerListeners.emit({ type: "connected", peerId: from });
  }

  private finishConnect(from: string, group: GroupInfo): void {
    const pending = this.pendingConnect;
    if (!pending || pending.groupId !== group.groupId) return;
    clearTimeout(pending.timer);
    this.pendingConnect = null;
    this.hostDeviceId = from;
    pending.resolve(group);
  }

  private failConnect(reason: string): void {
    const pending = this.pendingConnect;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingConnect = null;
    pending.reject(new Error(reason));
  }

  private receiveFrame(from: string, frame: Frame): void {
    if (from === this.hostDeviceId) return this.frameListeners.emit(frame, HOST_PEER_ID);
    if (this.members.has(from)) this.frameListeners.emit(frame, from);
  }

  private receiveDisconnect(from: string): void {
    if (from === this.hostDeviceId) {
      this.hostDeviceId = null;
      this.peerListeners.emit({ type: "disconnected", peerId: HOST_PEER_ID });
      return;
    }
    if (this.members.delete(from)) this.peerListeners.emit({ type: "disconnected", peerId: from });
  }
}
