import { create } from "zustand";
import type { DiscoveredGroup } from "@/lib/ble/transport";

interface ScanState {
  groups: DiscoveredGroup[];
  scanning: boolean;
  error: string | null;
  selected: DiscoveredGroup | null;
  begin: () => void;
  upsert: (group: DiscoveredGroup) => void;
  finish: (error?: string) => void;
  select: (group: DiscoveredGroup | null) => void;
}

export const useScanStore = create<ScanState>()((set) => ({
  groups: [],
  scanning: false,
  error: null,
  selected: null,
  begin: () => set({ groups: [], scanning: true, error: null }),
  upsert: (group) =>
    set((state) => {
      const others = state.groups.filter((g) => g.groupId !== group.groupId);
      return { groups: [...others, group].sort((a, b) => a.groupName.localeCompare(b.groupName)) };
    }),
  finish: (error) => set({ scanning: false, error: error ?? null }),
  select: (selected) => set({ selected }),
}));
