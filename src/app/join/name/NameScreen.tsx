"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { UsersIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { TextField } from "@/components/ui/TextField";
import { DISPLAY_NAME_MAX } from "@/lib/ble/constants";
import type { DiscoveredGroup } from "@/lib/ble/transport";
import { joinGroup } from "@/lib/session/controller";
import { errorMessage } from "@/lib/session/types";
import { validateDisplayName } from "@/lib/validation";
import { useScanStore } from "@/store/scanStore";

function NoGroupSelected() {
  return (
    <EmptyState
      icon={<UsersIcon />}
      title="No group selected"
      action={
        <Link id="name-pick-group" href="/join/" className={buttonClasses("secondary")}>
          Pick a group
        </Link>
      }
    >
      Choose a group from the list first.
    </EmptyState>
  );
}

function JoinForm({ group }: { group: DiscoveredGroup }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameError = validateDisplayName(displayName);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (nameError) return;
    setBusy(true);
    setError(null);
    try {
      await joinGroup(group.groupId, displayName);
      router.replace("/chat/");
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="glass flex animate-fade-up flex-col gap-6 rounded-3xl p-6">
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br from-cyan/25 to-violet/25">
          <UsersIcon />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-subtle">Joining</p>
          <p className="truncate font-display font-semibold">{group.groupName}</p>
        </div>
      </div>
      <TextField
        id="join-display-name"
        label="Your display name"
        placeholder="Sam"
        value={displayName}
        maxChars={DISPLAY_NAME_MAX}
        error={touched ? nameError : null}
        hint="Other Members see this name next to your messages."
        onValueChange={setDisplayName}
        autoFocus
      />
      {error ? <Alert title="Could not join the group">{error}</Alert> : null}
      <Button id="join-submit" type="submit" size="lg" loading={busy}>
        {busy ? "Connecting…" : "Join"}
      </Button>
    </form>
  );
}

export function NameScreen() {
  const group = useScanStore((s) => s.selected);
  return (
    <main className="safe-x mx-auto flex w-full max-w-md flex-1 flex-col pb-8">
      <ScreenHeader title="Display name" subtitle="How others see you" backHref="/join/" backId="name-back" />
      {group ? <JoinForm group={group} /> : <NoGroupSelected />}
    </main>
  );
}
