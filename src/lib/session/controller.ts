import { SCAN_DURATION_MS } from "@/lib/ble/constants";
import type { ScanSession } from "@/lib/ble/transport";
import { getTransport } from "@/lib/ble/transportFactory";
import { useChatStore } from "@/store/chatStore";
import { useScanStore } from "@/store/scanStore";
import { useSessionStore } from "@/store/sessionStore";
import { HostSession } from "./hostSession";
import { MemberSession } from "./memberSession";
import { errorMessage, type SessionSink } from "./types";

/**
 * The only module that UI code calls to run a Group.
 * It owns the current session and connects it to the Zustand stores.
 */

let current: HostSession | MemberSession | null = null;

const storeSink: SessionSink = {
  begin: (session) => useSessionStore.getState().begin(session),
  setMembers: (members) => useSessionStore.getState().setMembers(members),
  system: (text) => useChatStore.getState().addSystem(text),
  text: (id, senderId, senderName, text, at, own) => useChatStore.getState().addText({ id, senderId, senderName, text, at, own }),
  end: (reason) => {
    current = null;
    useSessionStore.getState().end(reason);
    useChatStore.getState().addSystem(reason);
  },
};

function resetStores(): void {
  useSessionStore.getState().reset();
  useChatStore.getState().clear();
}

function ensureIdle(): void {
  if (current) throw new Error("Leave the current Group first.");
}

interface ActiveScan {
  generation: number;
  session: ScanSession | null;
  timer: ReturnType<typeof setTimeout> | null;
}

let scan: ActiveScan = { generation: 0, session: null, timer: null };

export function stopScan(): void {
  scan.session?.stop();
  if (scan.timer) clearTimeout(scan.timer);
  scan = { generation: scan.generation + 1, session: null, timer: null };
  if (useScanStore.getState().scanning) useScanStore.getState().finish();
}

/** Scans for SCAN_DURATION_MS and writes each Group found to the scan store. */
export async function startScan(): Promise<void> {
  stopScan();
  const generation = scan.generation;
  useScanStore.getState().begin();
  try {
    const session = await getTransport().scan((group) => useScanStore.getState().upsert(group));
    // stopScan() ran while the Transport was starting the scan, so this scan is stale.
    if (generation !== scan.generation) return session.stop();
    scan = { generation, session, timer: setTimeout(stopScan, SCAN_DURATION_MS) };
  } catch (error) {
    if (generation === scan.generation) useScanStore.getState().finish(errorMessage(error));
  }
}

export async function createGroup(groupName: string, displayName: string): Promise<void> {
  ensureIdle();
  resetStores();
  const session = new HostSession(getTransport(), storeSink, groupName.trim(), displayName.trim());
  await session.start();
  current = session;
}

export async function joinGroup(groupId: string, displayName: string): Promise<void> {
  ensureIdle();
  resetStores();
  const session = new MemberSession(getTransport(), storeSink, groupId, displayName.trim());
  current = session;
  try {
    await session.start();
  } catch (error) {
    current = null;
    throw error;
  }
}

/** Member: leaves the Group. Host: the Group cannot exist without its Host, so this closes it. */
export async function leaveGroup(): Promise<void> {
  const session = current;
  current = null;
  try {
    if (session instanceof HostSession) await session.close();
    if (session instanceof MemberSession) await session.leave();
  } finally {
    resetStores();
  }
}

export async function closeGroup(): Promise<void> {
  if (!(current instanceof HostSession)) throw new Error("Only the Host can close the Group.");
  await leaveGroup();
}

/** Clears an ended session so the user can start again. */
export function dismissEndedSession(): void {
  current = null;
  resetStores();
}

export const sendText: (text: string) => Promise<void> = async (text) => {
  if (!current) throw new Error("Not in a Group.");
  await current.sendText(text);
};

export const sendFile: (file: File) => Promise<void> = async (file) => {
  if (!current) throw new Error("Not in a Group.");
  
  // File size validation (5MB max)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error(`File is too large (${(file.size/1024/1024).toFixed(1)}MB). Max size is 5MB.`);
  }

  const transport = getTransport();
  if (transport.sendFile) {
    await transport.sendFile(file);
    // Add system message indicating file is being sent
    useChatStore.getState().addSystem(`Sending file: ${file.name}...`);
  } else {
    throw new Error("File transfer is not supported by this transport.");
  }
};
