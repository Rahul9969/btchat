import type { Metadata } from "next";
import { CreateScreen } from "./CreateScreen";

export const metadata: Metadata = {
  title: "Create group",
  description: "Host a Bluetooth group chat on this device.",
};

export default function CreatePage() {
  return <CreateScreen />;
}
