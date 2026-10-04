import type { GroupMember } from "@/lib/ble/frames";
import type { GroupInfo } from "@/lib/ble/transport";

export type SessionRole = "host" | "member";

export interface ActiveSession {
  role: SessionRole;
  group: GroupInfo;
  selfId: string;
  selfName: string;
  members: GroupMember[];
}

/** Where a session reports state changes. The app writes them to Zustand; tests record them. */
export interface SessionSink {
  begin(session: ActiveSession): void;
  setMembers(members: GroupMember[]): void;
  system(text: string): void;
  text(id: string, senderId: string, senderName: string, text: string, at: number, own: boolean): void;
  end(reason: string): void;
}

/** Host first, then by display name. */
export function sortMembers(members: GroupMember[]): GroupMember[] {
  return [...members].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
