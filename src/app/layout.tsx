import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import "./globals.css";

// next/font downloads the fonts at build time and serves them from `out/`, so the app needs no internet at run time.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "BT Chat · Offline Bluetooth group chat", template: "%s · BT Chat" },
  description:
    "Chat and share files with people nearby over Bluetooth Low Energy. No internet and no server.",
  applicationName: "BT Chat",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} h-full antialiased`}>
      <body className="relative min-h-full overflow-x-hidden bg-ink-950">
        <AuroraBackground />
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
