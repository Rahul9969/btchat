"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTransportSupport, type TransportSupport } from "@/components/hooks/useTransportSupport";
import { TransportStatus } from "@/components/TransportStatus";
import { Alert } from "@/components/ui/Alert";
import { buttonClasses } from "@/components/ui/Button";
import { BluetoothIcon, PlusIcon, UsersIcon } from "@/components/ui/icons";

function HeroMark() {
  return (
    <div className="relative mx-auto grid h-32 w-32 place-items-center">
      <span className="absolute inset-0 animate-ping-slow rounded-full border border-cyan/30" />
      <span className="absolute inset-0 animate-ping-slow rounded-full border border-violet/30" style={{ animationDelay: "0.8s" }} />
      <span className="absolute inset-0 animate-ping-slow rounded-full border border-rose/20" style={{ animationDelay: "1.6s" }} />
      <span className="absolute inset-4 rounded-full bg-aurora opacity-30 blur-2xl" />
      <span className="glass relative grid h-20 w-20 place-items-center rounded-[1.75rem] text-4xl text-fg">
        <BluetoothIcon className="drop-shadow-[0_0_12px_hsl(188_95%_58%/0.7)]" />
      </span>
    </div>
  );
}

function disabledReason(support: TransportSupport, role: "host" | "join"): string | null {
  if (support.status && !support.status.supported) return support.status.reason;
  if (role === "host" && !support.canHost) return "This platform cannot advertise. Use the Android or iOS app to create a group.";
  if (role === "join" && !support.canJoin) return "This platform cannot join a group.";
  return null;
}

interface ActionLinkProps {
  id: string;
  href: string;
  label: string;
  caption: string;
  primary: boolean;
  blocked: string | null;
  icon: ReactNode;
}

function ActionLink({ id, href, label, caption, primary, blocked, icon }: ActionLinkProps) {
  const classes = buttonClasses(primary ? "primary" : "secondary", "lg", "w-full justify-start! gap-4! rounded-3xl! h-auto! py-4");
  const body = (
    <>
      <span className={`grid h-11 w-11 place-items-center rounded-2xl text-xl ${primary ? "bg-ink-950/15" : "bg-white/5"}`}>{icon}</span>
      <span className="flex flex-col items-start">
        <span className="font-display text-lg font-semibold">{label}</span>
        <span className={`text-xs ${primary ? "text-ink-950/70" : "text-muted"}`}>{caption}</span>
      </span>
    </>
  );
  if (blocked) {
    return (
      <button id={id} type="button" disabled title={blocked} className={classes}>
        {body}
      </button>
    );
  }
  return (
    <Link id={id} href={href} className={classes}>
      {body}
    </Link>
  );
}

export function HomeScreen() {
  const support = useTransportSupport();
  const unsupported = support.status && !support.status.supported ? support.status.reason : null;
  return (
    <main className="safe-x mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 py-[max(2rem,env(safe-area-inset-top))]">
      <section className="animate-fade-up space-y-6 text-center">
        <HeroMark />
        <div className="space-y-3">
          <h1 className="text-5xl font-bold">
            <span className="text-aurora">BT Chat</span>
          </h1>
          <p className="mx-auto max-w-xs text-balance text-muted">
            Group chat and file sharing with people nearby. Bluetooth only — no internet, no server.
          </p>
        </div>
        <TransportStatus support={support} />
      </section>

      {unsupported ? (
        <Alert title="Bluetooth is not available">{unsupported}</Alert>
      ) : null}

      <nav aria-label="Start" className="animate-fade-up space-y-3" style={{ animationDelay: "120ms" }}>
        <ActionLink
          id="home-create-group"
          href="/create"
          label="Create group"
          caption="Host a room on this device"
          primary
          blocked={disabledReason(support, "host")}
          icon={<PlusIcon />}
        />
        <ActionLink
          id="home-join-group"
          href="/join"
          label="Join group"
          caption="Find a group in range"
          primary={false}
          blocked={disabledReason(support, "join")}
          icon={<UsersIcon />}
        />
      </nav>

      {support.kind === "mock" ? (
        <p className="animate-fade-up text-center text-xs text-subtle" style={{ animationDelay: "240ms" }}>
          Development mode: open this page in a second tab to act as a second device.
        </p>
      ) : null}
    </main>
  );
}
