import type { Metadata } from "next";
import { ChatScreen } from "./ChatScreen";

export const metadata: Metadata = {
  title: "Chat",
  description: "Exchange messages and files.",
};

export default function ChatPage() {
  return <ChatScreen />;
}
