import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, X, Send, ChevronDown, ArrowLeft, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

type Message = {
  id: number;
  staffName: string;
  message: string;
  conversation: string;
  createdAt: string;
};

type LatestEntry = {
  conversation: string;
  lastMessage: Message;
};

type ReadReceipt = {
  staffName: string;
  lastReadAt: string;
};

type StaffMember = { id: number; name: string; role: string };

// ─── helpers ────────────────────────────────────────────────────────────────

function dmId(a: string, b: string) {
  return [a, b].sort().join("|");
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  "bg-orange-500", "bg-blue-500", "bg-green-500", "bg-purple-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-amber-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── unread tracking via localStorage ───────────────────────────────────────

function lsKey(myName: string, conv: string) {
  return `chat_seen:${myName}:${conv}`;
}
function getLastSeen(myName: string, conv: string): string {
  return localStorage.getItem(lsKey(myName, conv)) ?? new Date(0).toISOString();
}
function setLastSeen(myName: string, conv: string, iso: string) {
  localStorage.setItem(lsKey(myName, conv), iso);
}

// ─── api helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function fetchMessages(conversation: string, since?: string): Promise<Message[]> {
  const qs = since
    ? `?conversation=${encodeURIComponent(conversation)}&since=${encodeURIComponent(since)}`
    : `?conversation=${encodeURIComponent(conversation)}`;
  return apiFetch(`/api/messages${qs}`);
}

async function fetchLatest(): Promise<LatestEntry[]> {
  return apiFetch("/api/messages/latest");
}

async function fetchReads(conversation: string): Promise<ReadReceipt[]> {
  return apiFetch(`/api/messages/reads?conversation=${encodeURIComponent(conversation)}`);
}

async function markRead(conversation: string): Promise<void> {
  await fetch(`${BASE}/api/messages/read`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation }),
  });
}

async function sendMessage(message: string, conversation: string): Promise<Message> {
  const res = await fetch(`${BASE}/api/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation }),
  });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j?.error ? `: ${j.error}` : ""; } catch {}
    throw new Error(`${res.status}${detail}`);
  }
  return res.json();
}

async function fetchStaff(): Promise<StaffMember[]> {
  return apiFetch("/api/staff");
}

// Set of message IDs read by at least one other person (for blue ticks)
function buildReadSet(messages: Message[], reads: ReadReceipt[], myName: string): Set<number> {
  const set = new Set<number>();
  const others = reads.filter((r) => r.staffName !== myName);
  for (const msg of messages) {
    const msgTime = new Date(msg.createdAt).getTime();
    if (others.some((r) => new Date(r.lastReadAt).getTime() >= msgTime)) {
      set.add(msg.id);
    }
  }
  return set;
}

// Map of messageId -> readers whose last-read lands on this message (for group avatars)
function buildSeenByMap(messages: Message[], reads: ReadReceipt[], myName: string): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const receipt of reads) {
    if (receipt.staffName === myName) continue;
    const readTime = new Date(receipt.lastReadAt).getTime();
    let lastSeenMsgId: number | null = null;
    for (const msg of messages) {
      if (new Date(msg.createdAt).getTime() <= readTime) lastSeenMsgId = msg.id;
    }
    if (lastSeenMsgId !== null) {
      const existing = map.get(lastSeenMsgId) ?? [];
      map.set(lastSeenMsgId, [...existing, receipt.staffName]);
    }
  }
  return map;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "xs" }) {
  const sz = size === "xs" ? "w-4 h-4 text-[8px]" : size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";
  return (
    <div className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center font-black text-white shrink-0`}>
      {initials(name)}
    </div>
  );
}

// ─── DoubleTick ───────────────────────────────────────────────────────────────

function DoubleTick({ read }: { read: boolean }) {
  return (
    <svg
      viewBox="0 0 16 11"
      className="w-4 h-3 shrink-0 inline-block"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* first tick */}
      <path
        d="M1 5.5L4.5 9L10 2"
        stroke={read ? "#3b82f6" : "#9ca3af"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* second tick (offset right) */}
      <path
        d="M5 5.5L8.5 9L14 2"
        stroke={read ? "#3b82f6" : "#9ca3af"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg, isMe, showName, isRead, seenBy, isGroup,
}: {
  msg: Message;
  isMe: boolean;
  showName: boolean;
  isRead: boolean;
  seenBy: string[];
  isGroup: boolean;
}) {
  return (
    <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
      <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
        {!isMe && <Avatar name={msg.staffName} size="sm" />}
        <div className={`max-w-[75%] space-y-0.5 flex flex-col ${isMe ? "items-end" : "items-start"}`}>
          {showName && !isMe && (
            <p className="text-[10px] font-bold text-muted-foreground px-1">{msg.staffName}</p>
          )}
          <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
            isMe
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          }`}>
            {msg.message}
          </div>
          <div className={`flex items-center gap-1 px-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
            <p className="text-[10px] text-muted-foreground">{formatTime(msg.createdAt)}</p>
            {isMe && <DoubleTick read={isRead} />}
          </div>
        </div>
      </div>
      {/* Group avatars under the last message each person has seen */}
      {isMe && isGroup && seenBy.length > 0 && (
        <div className="flex items-center gap-0.5 mt-0.5 pr-1">
          {seenBy.slice(0, 4).map((n) => (
            <Avatar key={n} name={n} size="xs" />
          ))}
          {seenBy.length > 4 && (
            <span className="text-[9px] text-muted-foreground ml-0.5">+{seenBy.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ChatView ────────────────────────────────────────────────────────────────

function ChatView({
  myName,
  conversation,
  title,
  isGroup,
  onBack,
}: {
  myName: string;
  conversation: string;
  title: string;
  isGroup: boolean;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reads, setReads] = useState<ReadReceipt[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sinceRef = useRef<string | undefined>(undefined);

  const scrollToBottom = useCallback((smooth = false) => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: smooth ? "smooth" : "instant" });
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchMessages(conversation).then((data) => {
      setMessages(data);
      if (data.length) {
        sinceRef.current = data[data.length - 1].createdAt;
        setLastSeen(myName, conversation, data[data.length - 1].createdAt);
      }
      setTimeout(() => scrollToBottom(), 50);
    }).catch(() => {});
    markRead(conversation).catch(() => {});
    fetchReads(conversation).then(setReads).catch(() => {});
    inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation]);

  // Poll messages every 4s
  useEffect(() => {
    const tick = async () => {
      try {
        const fresh = await fetchMessages(conversation, sinceRef.current);
        if (fresh.length) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            return [...prev, ...fresh.filter((m) => !ids.has(m.id))];
          });
          sinceRef.current = fresh[fresh.length - 1].createdAt;
          setLastSeen(myName, conversation, fresh[fresh.length - 1].createdAt);
          markRead(conversation).catch(() => {});
        }
      } catch {}
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [conversation, myName]);

  // Poll reads every 4s
  useEffect(() => {
    const id = setInterval(() => {
      fetchReads(conversation).then(setReads).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [conversation]);

  // Auto-scroll when new messages arrive and already at bottom
  useEffect(() => {
    if (atBottom) scrollToBottom(true);
  }, [messages, atBottom, scrollToBottom]);

  function handleScroll() {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setAtBottom(scrollHeight - scrollTop - clientHeight < 60);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    setDraft("");
    try {
      const msg = await sendMessage(text, conversation);
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      sinceRef.current = msg.createdAt;
      setLastSeen(myName, conversation, msg.createdAt);
      markRead(conversation).catch(() => {});
      setTimeout(() => scrollToBottom(true), 30);
    } catch (e) {
      const err = e as Error;
      setSendError(err.message || "Failed to send message");
      setDraft(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const readSet = buildReadSet(messages, reads, myName);
  const seenByMap = buildSeenByMap(messages, reads, myName);

  // Group by day
  const grouped: { day: string; items: Message[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    if (!grouped.length || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, items: [msg] });
    } else {
      grouped[grouped.length - 1].items.push(msg);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-3 border-b border-border bg-card">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isGroup ? "bg-primary/20" : avatarColor(title)}`}>
          {isGroup
            ? <Users className="w-4 h-4 text-primary" />
            : <span className="text-[10px] font-black text-white">{initials(title)}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground truncate">{title}</p>
          <p className="text-[11px] text-muted-foreground">{isGroup ? "All staff" : "Private"}</p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 relative"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No messages yet — say something!</p>
          </div>
        )}
        {grouped.map(({ day, items }) => (
          <div key={day} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">{day}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {items.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMe={msg.staffName === myName}
                showName={isGroup && (i === 0 || items[i - 1].staffName !== msg.staffName)}
                isRead={readSet.has(msg.id)}
                seenBy={seenByMap.get(msg.id) ?? []}
                isGroup={isGroup}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Scroll to bottom */}
      {!atBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 right-4 w-8 h-8 rounded-full bg-card border border-border shadow flex items-center justify-center text-muted-foreground hover:text-foreground z-10"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}

      {/* Send error */}
      {sendError && (
        <div className="shrink-0 px-3 pb-1 flex items-center gap-1.5">
          <span className="text-[11px] text-destructive flex-1">Failed to send: {sendError}</span>
          <button onClick={() => setSendError(null)} className="text-[10px] text-muted-foreground hover:text-foreground underline">Dismiss</button>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border px-3 py-3 flex gap-2 bg-card">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={`Message ${isGroup ? "all staff" : title}…`}
          className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={send}
          disabled={!draft.trim() || sending}
          className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

// ─── InboxView ────────────────────────────────────────────────────────────────

function InboxView({
  myName,
  staff,
  onSelect,
  onClose,
}: {
  myName: string;
  staff: StaffMember[];
  onSelect: (conv: string, title: string, isGroup: boolean) => void;
  onClose: () => void;
}) {
  const [latest, setLatest] = useState<LatestEntry[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const computeUnread = useCallback((entries: LatestEntry[]) => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      const seen = new Date(getLastSeen(myName, e.conversation)).getTime();
      const msgTime = new Date(e.lastMessage.createdAt).getTime();
      if (e.lastMessage.staffName !== myName && msgTime > seen) {
        counts[e.conversation] = (counts[e.conversation] ?? 0) + 1;
      }
    }
    setUnread(counts);
  }, [myName]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchLatest();
      setLatest(data);
      computeUnread(data);
    } catch {}
  }, [computeUnread]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const otherStaff = staff.filter((s) => s.name !== myName);

  function getLatest(conv: string) {
    return latest.find((e) => e.conversation === conv);
  }

  function previewText(entry?: LatestEntry) {
    if (!entry) return null;
    const msg = entry.lastMessage;
    const prefix = msg.staffName === myName ? "You: " : `${msg.staffName.split(" ")[0]}: `;
    return prefix + (msg.message.length > 38 ? msg.message.slice(0, 38) + "…" : msg.message);
  }

  function previewTime(entry?: LatestEntry) {
    if (!entry) return null;
    return formatTime(entry.lastMessage.createdAt);
  }

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return (
    <>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-black uppercase tracking-wide text-foreground">
            Staff Chat
            {totalUnread > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-destructive text-white text-[10px] font-black">
                {totalUnread}
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">Select a conversation</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {/* Group */}
        <ConvRow
          icon={<Users className="w-4 h-4 text-primary" />}
          iconBg="bg-primary/20"
          title="All Staff"
          subtitle="Group · visible to everyone"
          preview={previewText(getLatest("group"))}
          time={previewTime(getLatest("group"))}
          unread={unread["group"] ?? 0}
          onClick={() => onSelect("group", "All Staff", true)}
        />

        {/* DMs */}
        {otherStaff.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1">
              Direct Messages
            </p>
            {otherStaff.map((s) => {
              const conv = dmId(myName, s.name);
              const u = unread[conv] ?? 0;
              return (
                <ConvRow
                  key={s.id}
                  icon={<span className="text-[10px] font-black text-white">{initials(s.name)}</span>}
                  iconBg={avatarColor(s.name)}
                  title={s.name}
                  subtitle={s.role}
                  preview={previewText(getLatest(conv))}
                  time={previewTime(getLatest(conv))}
                  unread={u}
                  onClick={() => onSelect(conv, s.name, false)}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function ConvRow({
  icon, iconBg, title, subtitle, preview, time, unread, onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  preview: string | null;
  time: string | null;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
    >
      <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm font-bold truncate ${unread > 0 ? "text-foreground" : "text-foreground/80"}`}>
            {title}
          </p>
          {time && <p className="text-[10px] text-muted-foreground shrink-0">{time}</p>}
        </div>
        {preview ? (
          <p className={`text-xs truncate mt-0.5 ${unread > 0 ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
            {preview}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50 mt-0.5 italic">{subtitle}</p>
        )}
      </div>
      {unread > 0 && (
        <span className="shrink-0 min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-black flex items-center justify-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

// ─── ChatPanel (root) ─────────────────────────────────────────────────────────

export default function ChatPanel() {
  const { user } = useAuth();
  const myName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Staff" : null;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"inbox" | "chat">("inbox");
  const [activeConv, setActiveConv] = useState<{ id: string; title: string; isGroup: boolean } | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!myName) return;
    fetchStaff().then(setStaff).catch(() => {});
  }, [myName]);

  useEffect(() => {
    if (!myName || open) return;
    const tick = async () => {
      try {
        const entries = await fetchLatest();
        let count = 0;
        for (const e of entries) {
          if (e.lastMessage.staffName === myName) continue;
          const seen = new Date(getLastSeen(myName, e.conversation)).getTime();
          const msgTime = new Date(e.lastMessage.createdAt).getTime();
          if (msgTime > seen) count++;
        }
        setTotalUnread(count);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [myName, open]);

  function openInbox() {
    setOpen(true);
    setView("inbox");
    setTotalUnread(0);
  }

  function selectConv(id: string, title: string, isGroup: boolean) {
    setActiveConv({ id, title, isGroup });
    setView("chat");
  }

  function goBack() {
    setView("inbox");
    setActiveConv(null);
  }

  if (!myName) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={openInbox}
        className={`fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all
          ${open ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"}
          bg-primary text-primary-foreground hover:opacity-90`}
        aria-label="Open staff chat"
      >
        <MessageSquare className="w-6 h-6" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-white text-[11px] font-black flex items-center justify-center">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </button>

      {/* Panel */}
      <div
        className={`fixed bottom-0 right-0 z-50 flex flex-col transition-all duration-300 ease-in-out
          w-full sm:w-96 sm:right-4 sm:bottom-4 sm:rounded-2xl
          bg-card border border-border shadow-2xl overflow-hidden
          ${open ? "h-[82dvh] sm:h-[540px] opacity-100" : "h-0 opacity-0 pointer-events-none"}`}
      >
        {view === "inbox" && myName && (
          <InboxView
            myName={myName}
            staff={staff}
            onSelect={selectConv}
            onClose={() => setOpen(false)}
          />
        )}
        {view === "chat" && activeConv && myName && (
          <ChatView
            myName={myName}
            conversation={activeConv.id}
            title={activeConv.title}
            isGroup={activeConv.isGroup}
            onBack={goBack}
          />
        )}
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
