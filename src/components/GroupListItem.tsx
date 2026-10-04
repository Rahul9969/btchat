import type { DiscoveredGroup } from "@/lib/ble/transport";
import { SignalBars } from "./SignalBars";
import { ChevronRightIcon, UsersIcon } from "./ui/icons";

interface GroupListItemProps {
  group: DiscoveredGroup;
  index: number;
  onSelect: (group: DiscoveredGroup) => void;
}

export function GroupListItem({ group, index, onSelect }: GroupListItemProps) {
  return (
    <li className="animate-fade-up" style={{ animationDelay: `${index * 60}ms` }}>
      <button
        id={`group-${group.groupId}`}
        type="button"
        onClick={() => onSelect(group)}
        className="glass group flex w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan/30"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-linear-to-br from-cyan/25 to-violet/25 text-xl text-fg">
          <UsersIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-semibold text-fg">{group.groupName}</span>
          <span className="block font-mono text-xs text-subtle">#{group.groupId}</span>
        </span>
        <SignalBars rssi={group.rssi} />
        <ChevronRightIcon className="text-lg text-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
      </button>
    </li>
  );
}
