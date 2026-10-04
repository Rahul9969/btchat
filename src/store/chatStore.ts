import { create } from "zustand";
import { randomId } from "@/lib/id";

export interface SystemItem {
  kind: "system";
  id: string;
  text: string;
  at: number;
}

export interface TextItem {
  kind: "text";
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  at: number;
  own: boolean;
}

export type ChatItem = SystemItem | TextItem;

interface ChatState {
  items: ChatItem[];
  addSystem: (text: string) => void;
  addText: (item: Omit<TextItem, "kind">) => void;
  clear: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  items: [],
  addSystem: (text) =>
    set((state) => ({
      items: [...state.items, { kind: "system", id: randomId(6), text, at: Date.now() }],
    })),
  addText: (item) =>
    set((state) => {
      if (state.items.some((existing) => existing.id === item.id)) return state;
      return { items: [...state.items, { kind: "text", ...item }] };
    }),
  clear: () => set({ items: [] }),
}));
