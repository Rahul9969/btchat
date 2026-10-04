/** Maps RSSI (dBm) to 0..4 bars. Thresholds follow common Android signal-level buckets. */
export function rssiToBars(rssi: number): number {
  if (rssi >= -55) return 4;
  if (rssi >= -67) return 3;
  if (rssi >= -80) return 2;
  if (rssi >= -90) return 1;
  return 0;
}

export function SignalBars({ rssi }: { rssi: number | null }) {
  const bars = rssi === null ? 0 : rssiToBars(rssi);
  const label = rssi === null ? "Signal strength not reported" : `Signal ${rssi} dBm`;
  return (
    <div className="flex flex-col items-end gap-1" title={label}>
      <div className="flex h-4 items-end gap-[3px]" aria-hidden>
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={`w-[4px] rounded-full ${level <= bars ? "bg-aurora" : "bg-white/12"}`}
            style={{ height: `${level * 25}%` }}
          />
        ))}
      </div>
      <span className="text-[11px] tabular-nums text-subtle">{rssi === null ? "n/a" : `${rssi} dBm`}</span>
    </div>
  );
}
