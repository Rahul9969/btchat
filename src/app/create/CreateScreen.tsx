"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { BluetoothIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { TextField } from "@/components/ui/TextField";
import { DISPLAY_NAME_MAX, GROUP_NAME_MAX } from "@/lib/ble/constants";
import { createGroup } from "@/lib/session/controller";
import { errorMessage } from "@/lib/session/types";
import { validateDisplayName, validateGroupName } from "@/lib/validation";

export function CreateScreen() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupError = validateGroupName(groupName);
  const nameError = validateDisplayName(displayName);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (groupError || nameError) return;
    setBusy(true);
    setError(null);
    try {
      await createGroup(groupName, displayName);
      router.replace("/chat/");
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <main className="safe-x mx-auto flex w-full max-w-md flex-1 flex-col pb-8">
      <ScreenHeader title="Create group" subtitle="This device becomes the Host" backHref="/" backId="create-back" />
      <form onSubmit={onSubmit} noValidate className="glass flex animate-fade-up flex-col gap-6 rounded-3xl p-6">
        <TextField
          id="create-group-name"
          label="Group name"
          placeholder="Road trip"
          value={groupName}
          maxChars={GROUP_NAME_MAX}
          error={touched ? groupError : null}
          onValueChange={setGroupName}
          autoFocus
        />
        <TextField
          id="create-display-name"
          label="Your display name"
          placeholder="Alex"
          value={displayName}
          maxChars={DISPLAY_NAME_MAX}
          error={touched ? nameError : null}
          hint="Other Members see this name next to your messages."
          onValueChange={setDisplayName}
        />
        {error ? <Alert title="Could not create the group">{error}</Alert> : null}
        <Button id="create-submit" type="submit" size="lg" loading={busy} icon={<BluetoothIcon />}>
          Create
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-subtle">
        Members in Bluetooth range can find this group while this screen stays open.
      </p>
    </main>
  );
}
