"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@/components/EmptyState";
import { GroupListItem } from "@/components/GroupListItem";
import { useTransportSupport } from "@/components/hooks/useTransportSupport";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { RadarIcon, RefreshIcon } from "@/components/ui/icons";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import type { DiscoveredGroup } from "@/lib/ble/transport";
import { startScan, stopScan } from "@/lib/session/controller";
import { useScanStore } from "@/store/scanStore";

function ScanResults({ onSelect, onRescan }: { onSelect: (g: DiscoveredGroup) => void; onRescan: () => void }) {
  const groups = useScanStore((s) => s.groups);
  const scanning = useScanStore((s) => s.scanning);
  if (groups.length > 0) {
    return (
      <ul className="flex flex-col gap-3" aria-label="Groups in range">
        {groups.map((group, index) => (
          <GroupListItem key={group.groupId} group={group} index={index} onSelect={onSelect} />
        ))}
      </ul>
    );
  }
  if (scanning) {
    return (
      <EmptyState icon={<RadarIcon />} title="Searching for groups…" pulsing>
        Keep this device near the Host. Groups appear here as soon as they are found.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      icon={<RadarIcon />}
      title="No groups found"
      action={
        <Button id="join-empty-rescan" variant="secondary" icon={<RefreshIcon />} onClick={onRescan}>
          Rescan
        </Button>
      }
    >
      Make sure the Host has the group open and is within about 10 metres.
    </EmptyState>
  );
}

export function JoinScreen() {
  const router = useRouter();
  const support = useTransportSupport();
  const scanning = useScanStore((s) => s.scanning);
  const scanError = useScanStore((s) => s.error);
  const ready = support.status?.supported === true;
  // Web Bluetooth needs a user tap before each scan, so only platforms with their own list scan on open.
  const autoScan = ready && support.listsGroups;

  useEffect(() => {
    if (autoScan) void startScan();
    return stopScan;
  }, [autoScan]);

  function onSelect(group: DiscoveredGroup) {
    stopScan();
    useScanStore.getState().select(group);
    router.push("/join/name/");
  }

  const rescan = (
    <Button
      id="join-rescan"
      variant="secondary"
      size="md"
      disabled={!ready}
      onClick={() => void startScan()}
      icon={<RefreshIcon className={scanning ? "animate-spin" : ""} />}
    >
      {scanning ? "Scanning" : "Rescan"}
    </Button>
  );

  return (
    <main className="safe-x mx-auto flex w-full max-w-md flex-1 flex-col pb-8">
      <ScreenHeader title="Join group" subtitle="Groups in Bluetooth range" backHref="/" backId="join-back" right={rescan} />
      <div className="flex flex-col gap-4">
        {support.status && !support.status.supported ? (
          <Alert title="Bluetooth is not available">{support.status.reason}</Alert>
        ) : null}
        {scanError ? <Alert title="Scan failed">{scanError}</Alert> : null}
        <ScanResults onSelect={onSelect} onRescan={() => void startScan()} />
      </div>
    </main>
  );
}
