import type { Metadata } from "next";
import { JoinScreen } from "./JoinScreen";

export const metadata: Metadata = {
  title: "Join group",
  description: "Find Bluetooth group chats in range and join one.",
};

export default function JoinPage() {
  return <JoinScreen />;
}
