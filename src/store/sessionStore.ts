import { create } from "zustand";
import type { GroupMember } from "@/lib/ble/frames";
import type { GroupInfo } from "@/lib/ble/transport";
import type { ActiveSession, SessionRole } from "@/lib/session/types";

export type SessionStatus = "idle" | "active" | "ended";

interface SessionState {
  status: SessionStatus;
  role: SessionRole | null;
  group: GroupInfo | null;
  selfId: string | null;
  selfName: string;
  members: GroupMember[];
  endReason: string | null;
  begin: (session: ActiveSession) => void;
  setMembers: (members: GroupMember[]) => void;
  end: (reason: string) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as SessionStatus,
  role: null,
  group: null,
  selfId: null,
  selfName: "",
  members: [],
  endReason: null,
};

export const useSessionStore = create<SessionState>()((set) => ({
  ...initial,
  begin: (session) => set({ ...session, status: "active", endReason: null }),
  setMembers: (members) =>
    set((state) => ({
      members,
      group: state.group ? { ...state.group, memberCount: members.length } : null,
    })),
  end: (reason) => set({ status: "ended", endReason: reason }),
  reset: () => set(initial),
}));
