"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { CrownIcon, LogOutIcon, PaperclipIcon, PowerIcon, SendIcon, UsersIcon } from "@/components/ui/icons";
import { closeGroup, leaveGroup, sendFile, sendText } from "@/lib/session/controller";
import { useChatStore } from "@/store/chatStore";
import { useSessionStore } from "@/store/sessionStore";

function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

function ChatMessage({ item }: { item: ReturnType<typeof useChatStore.getState>["items"][number] }) {
  if (item.kind === "system") {
    return (
      <div className="my-4 text-center text-xs font-medium text-muted">
        <span className="inline-block rounded-full bg-white/[0.04] px-3 py-1">{item.text}</span>
      </div>
    );
  }

  const isOwn = item.own;
  return (
    <div className={`mb-3 flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] text-subtle">
        {isOwn ? null : <span className="font-semibold text-fg/80">{item.senderName}</span>}
        <span>{formatTime(item.at)}</span>
      </div>
      <div
        className={`max-w-[85%] break-words rounded-2xl px-4 py-2.5 text-sm ${
          isOwn ? "bg-aurora text-ink-950 rounded-br-sm" : "glass text-fg rounded-bl-sm"
        }`}
      >
        {item.text}
      </div>
    </div>
  );
}

function InputArea() {
  const [text, setText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    sendText(text).catch((err) => console.error(err));
    setText("");
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      sendFile(file).catch((err) => console.error(err));
      // Reset input so the same file can be selected again
      event.target.value = '';
    }
  }

  return (
    <form onSubmit={onSubmit} className="safe-x flex items-end gap-2 bg-ink-950 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />
      <Button 
        type="button"
        variant="secondary" 
        size="icon" 
        className="shrink-0 rounded-full" 
        onClick={() => fileInputRef.current?.click()}
      >
        <PaperclipIcon />
      </Button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message…"
        className="h-11 flex-1 rounded-2xl border border-white/10 bg-ink-900 px-4 text-sm text-fg placeholder:text-subtle focus:border-cyan/60 focus:bg-ink-950 focus:outline-none focus:ring-4 focus:ring-cyan/15"
      />
      <Button type="submit" variant="primary" size="icon" className="shrink-0 rounded-full" disabled={!text.trim()}>
        <SendIcon className="mr-0.5 mt-0.5" />
      </Button>
    </form>
  );
}

export function ChatScreen() {
  const router = useRouter();
  const session = useSessionStore();
  const items = useChatStore((s) => s.items);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session.status === "idle") router.replace("/");
  }, [session.status, router]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  if (session.status !== "active") return null;

  const roleLabel = session.role === "host" ? "Host" : "Member";
  const membersText = `${session.members.length} member${session.members.length === 1 ? "" : "s"}`;
  const isHost = session.role === "host";

  const leaveBtn = (
    <Button variant="ghost" size="icon" onClick={() => setConfirmLeave(true)}>
      {isHost ? <PowerIcon className="text-rose" /> : <LogOutIcon />}
    </Button>
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="safe-x flex shrink-0 items-center justify-between border-b border-white/5 bg-ink-950 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-cyan/20 to-violet/20 text-fg">
            {isHost ? <CrownIcon /> : <UsersIcon />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display font-semibold leading-tight text-fg">{session.group?.groupName}</h1>
            <p className="truncate text-[11px] text-muted">
              {roleLabel} · {membersText}
            </p>
          </div>
        </div>
        {leaveBtn}
      </header>

      <main ref={scrollRef} className="safe-x flex-1 overflow-y-auto pt-4">
        <div className="mx-auto max-w-3xl">
          {items.map((item) => (
            <ChatMessage key={item.id} item={item} />
          ))}
        </div>
      </main>

      <InputArea />

      <ConfirmDialog
        open={confirmLeave}
        title={isHost ? "Close group?" : "Leave group?"}
        confirmLabel={isHost ? "Close group" : "Leave"}
        confirmId="chat-confirm-leave"
        onConfirm={isHost ? closeGroup : leaveGroup}
        onCancel={() => setConfirmLeave(false)}
      >
        {isHost
          ? "Closing the group will disconnect all Members. The chat history will be lost."
          : "You will disconnect from the group. The chat history will be lost."}
      </ConfirmDialog>
    </div>
  );
}
