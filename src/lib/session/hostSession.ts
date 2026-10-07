import { DISPLAY_NAME_MAX, HOST_PEER_ID, MAX_MEMBERS } from "@/lib/ble/constants";
import type { Frame, GroupMember } from "@/lib/ble/frames";
import type { GroupInfo, PeerEvent, PeerId, Transport, Unsubscribe } from "@/lib/ble/transport";
import { randomId } from "@/lib/id";
import { sanitizeName } from "@/lib/validation";
import { errorMessage, sortMembers, type SessionSink } from "./types";

/** Host side of a Group: accepts JOINs, keeps the member list, and tells every Member about changes. */
export class HostSession {
  private group: GroupInfo;
  private members: GroupMember[];
  private unsubscribers: Unsubscribe[] = [];

  constructor(
    private readonly transport: Transport,
    private readonly sink: SessionSink,
    groupName: string,
    private readonly displayName: string,
  ) {
    this.group = { groupId: randomId(4), groupName, memberCount: 1 };
    this.members = [{ memberId: HOST_PEER_ID, displayName, isHost: true }];
  }

  async start(): Promise<void> {
    this.attach();
    try {
      await this.transport.startAdvertising(this.group);
    } catch (error) {
      this.detach();
      throw error;
    }
    this.sink.begin({
      role: "host",
      group: this.group,
      selfId: HOST_PEER_ID,
      selfName: this.displayName,
      members: this.members,
    });
    this.sink.system(`You created “${this.group.groupName}”. Waiting for Members to join.`);
  }

  async close(): Promise<void> {
    this.detach();
    try {
      await this.transport.send({ type: "CLOSE", reason: "The Host closed the Group." });
    } finally {
      await this.transport.stopAdvertising();
      await this.transport.disconnect();
    }
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

  private readonly onFrame = (frame: Frame, from: PeerId): void => {
    switch (frame.type) {
      case "JOIN":
        return this.run(this.addMember(from, frame.displayName));
      case "LEAVE":
        return this.run(this.removeMember(from));
      case "TEXT": {
        const member = this.members.find((m) => m.memberId === from);
        if (!member) return; // Drop messages from unknown peers
        
        // Prevent impersonation: override with trusted identity
        frame.senderId = member.memberId;
        frame.senderName = member.displayName;

        this.sink.text(frame.textId, frame.senderId, frame.senderName, frame.text, frame.sentAt, false);
        const others = this.members.filter((m) => m.memberId !== HOST_PEER_ID && m.memberId !== from).map((m) => m.memberId);
        if (others.length > 0) {
          this.run(this.transport.send(frame, others));
        }
        return;
      }
      default:
        // FILE_* Frames are handled in Phase 4.
        return;
    }
  };

  private readonly onPeerEvent = (event: PeerEvent): void => {
    if (event.type === "disconnected") this.run(this.removeMember(event.peerId));
  };

  private run(task: Promise<void>): void {
    task.catch((error: unknown) => this.sink.system(`Error: ${errorMessage(error)}`));
  }

  private async addMember(peerId: PeerId, rawName: string): Promise<void> {
    const others = this.members.filter((m) => m.memberId !== peerId);
    
    // MAX_MEMBERS does not include the Host. 'others' includes the host.
    // So others.length >= MAX_MEMBERS + 1 means the group is full.
    if (others.length >= MAX_MEMBERS + 1) {
      this.sink.system(`Join request from ${rawName} rejected (group is full).`);
      return;
    }
    
    const displayName = sanitizeName(rawName, DISPLAY_NAME_MAX, "Member");
    this.members = sortMembers([...others, { memberId: peerId, displayName, isHost: false }]);
    await this.transport.send(
      { type: "JOIN_ACK", memberId: peerId, groupId: this.group.groupId, groupName: this.group.groupName },
      [peerId],
    );
    await this.publishMembers();
    this.sink.system(`${displayName} joined.`);
  }

  private async removeMember(peerId: PeerId): Promise<void> {
    const member = this.members.find((m) => m.memberId === peerId && !m.isHost);
    if (!member) return;
    this.members = this.members.filter((m) => m.memberId !== peerId);
    await this.publishMembers();
    this.sink.system(`${member.displayName} left.`);
  }

  private async publishMembers(): Promise<void> {
    this.group = { ...this.group, memberCount: this.members.length };
    this.sink.setMembers(this.members);
    await this.transport.updateGroupInfo(this.group);
    await this.transport.send({ type: "MEMBER_LIST", members: this.members });
  }

  async sendText(text: string): Promise<void> {
    const textId = randomId(6);
    const sentAt = Date.now();
    const frame: Frame = {
      type: "TEXT",
      textId,
      senderId: HOST_PEER_ID,
      senderName: this.displayName,
      text,
      sentAt,
    };
    await this.transport.send(frame);
    this.sink.text(textId, HOST_PEER_ID, this.displayName, text, sentAt, true);
  }
}
