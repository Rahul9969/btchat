import { CONNECT_TIMEOUT_MS, HOST_PEER_ID } from "@/lib/ble/constants";
import type { Frame, GroupMember, JoinAckFrame } from "@/lib/ble/frames";
import type { GroupInfo, PeerEvent, Transport, Unsubscribe } from "@/lib/ble/transport";
import { randomId } from "@/lib/id";
import { errorMessage, type SessionSink } from "./types";

interface PendingJoin {
  info: GroupInfo;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Member side of a Group: connects, sends JOIN, and follows the Host's member list. */
export class MemberSession {
  private unsubscribers: Unsubscribe[] = [];
  private pendingJoin: PendingJoin | null = null;
  private members: GroupMember[] = [];
  private selfId: string | null = null;
  private active = false;

  constructor(
    private readonly transport: Transport,
    private readonly sink: SessionSink,
    private readonly groupId: string,
    private readonly displayName: string,
  ) {}

  async start(): Promise<void> {
    const info = await this.transport.connect(this.groupId);
    this.attach();
    try {
      await this.sendJoin(info);
    } catch (error) {
      this.detach();
      await this.transport.disconnect();
      throw error;
    }
  }

  async leave(): Promise<void> {
    this.detach();
    this.active = false;
    try {
      if (this.selfId) await this.transport.send({ type: "LEAVE", memberId: this.selfId });
    } finally {
      await this.transport.disconnect();
    }
  }

  private sendJoin(info: GroupInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.failJoin("The Host did not answer the JOIN."), CONNECT_TIMEOUT_MS);
      this.pendingJoin = { info, resolve, reject, timer };
      this.transport
        .send({ type: "JOIN", displayName: this.displayName })
        .catch((error: unknown) => this.failJoin(errorMessage(error)));
    });
  }

  private failJoin(reason: string): void {
    const pending = this.pendingJoin;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingJoin = null;
    pending.reject(new Error(reason));
  }

  private attach(): void {
    this.unsubscribers = [
      this.transport.onFrame(this.onFrame),
      this.transport.onPeerEvent(this.onPeerEvent),
    ];
  }

  private detach(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }

  private readonly onFrame = (frame: Frame): void => {
    switch (frame.type) {
      case "JOIN_ACK":
        return this.acceptJoin(frame);
      case "MEMBER_LIST":
        return this.updateMembers(frame.members);
      case "TEXT":
        return this.sink.text(frame.textId, frame.senderId, frame.senderName, frame.text, frame.sentAt, false);
      case "CLOSE":
        return this.finish(frame.reason);
      default:
        // FILE_* Frames are handled in Phase 4.
        return;
    }
  };

  private readonly onPeerEvent = (event: PeerEvent): void => {
    if (event.type === "disconnected" && event.peerId === HOST_PEER_ID) {
      this.finish("The connection to the Host was lost.");
    }
  };

  private acceptJoin(frame: JoinAckFrame): void {
    const pending = this.pendingJoin;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingJoin = null;
    this.selfId = frame.memberId;
    this.active = true;
    const group = { groupId: frame.groupId, groupName: frame.groupName, memberCount: pending.info.memberCount };
    this.sink.begin({ role: "member", group, selfId: frame.memberId, selfName: this.displayName, members: this.members });
    this.sink.system(`You joined “${frame.groupName}”.`);
    pending.resolve();
  }

  private updateMembers(members: GroupMember[]): void {
    this.members = members;
    if (this.active) this.sink.setMembers(members);
  }

  private finish(reason: string): void {
    this.detach();
    this.failJoin(reason);
    if (this.active) this.sink.end(reason);
    this.active = false;
    void this.transport.disconnect();
  }

  async sendText(text: string): Promise<void> {
    if (!this.selfId) return;
    const textId = randomId(6);
    const sentAt = Date.now();
    const frame: Frame = {
      type: "TEXT",
      textId,
      senderId: this.selfId,
      senderName: this.displayName,
      text,
      sentAt,
    };
    await this.transport.send(frame);
    this.sink.text(textId, this.selfId, this.displayName, text, sentAt, true);
  }
}
