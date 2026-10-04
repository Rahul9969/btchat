/**
 * Frame definitions. A Frame is one logical message.
 * The binary encoder (Phase 2) turns a Frame into one or more Packets.
 */

/** Wire codes for the Packet header `type` byte. */
export const FrameType = {
  JOIN: 0x01,
  JOIN_ACK: 0x02,
  MEMBER_LIST: 0x03,
  TEXT: 0x04,
  FILE_OFFER: 0x05,
  FILE_ACCEPT: 0x06,
  FILE_CHUNK: 0x07,
  FILE_DONE: 0x08,
  LEAVE: 0x09,
  CLOSE: 0x0a,
} as const;

export type FrameTypeName = keyof typeof FrameType;

export interface GroupMember {
  memberId: string;
  displayName: string;
  isHost: boolean;
}

export interface JoinFrame {
  type: "JOIN";
  displayName: string;
}

export interface JoinAckFrame {
  type: "JOIN_ACK";
  memberId: string;
  groupId: string;
  groupName: string;
}

export interface MemberListFrame {
  type: "MEMBER_LIST";
  members: GroupMember[];
}

export interface TextFrame {
  type: "TEXT";
  textId: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export interface FileOfferFrame {
  type: "FILE_OFFER";
  fileId: string;
  senderId: string;
  senderName: string;
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
}

export interface FileAcceptFrame {
  type: "FILE_ACCEPT";
  fileId: string;
  memberId: string;
}

/** The only Frame that is not JSON on the wire. */
export interface FileChunkFrame {
  type: "FILE_CHUNK";
  fileId: string;
  index: number;
  data: Uint8Array;
}

export interface FileDoneFrame {
  type: "FILE_DONE";
  fileId: string;
  status: "complete" | "cancelled";
}

export interface LeaveFrame {
  type: "LEAVE";
  memberId: string;
}

export interface CloseFrame {
  type: "CLOSE";
  reason: string;
}

export type Frame =
  | JoinFrame
  | JoinAckFrame
  | MemberListFrame
  | TextFrame
  | FileOfferFrame
  | FileAcceptFrame
  | FileChunkFrame
  | FileDoneFrame
  | LeaveFrame
  | CloseFrame;

export type FrameOf<T extends FrameTypeName> = Extract<Frame, { type: T }>;
