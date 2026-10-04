import type { Metadata } from "next";
import { NameScreen } from "./NameScreen";

export const metadata: Metadata = {
  title: "Your display name",
  description: "Choose the name other Members see in the group.",
};

export default function NamePage() {
  return <NameScreen />;
}
