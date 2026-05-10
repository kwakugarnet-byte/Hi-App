import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, X, Send, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Message = {
  id: number;
  staffName: string;
  message: string;
  createdAt: string;
};

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

export default function ChatPanel() {
  const { user } = useAuth();
  const myName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Staff"
    : null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [atBottom, setAtBottom] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestIdRef = useRef<number>(0);
  const openRef = useRef(open);
  openRef.current = open;

  const scrollToBottom = useCallback((smooth = false) => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!myName) return;
    fetch(`${BASE}/api/messages`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Message[]) => {
        setMessages(data);
        if (data.length) latestIdRef.current = data[data.length - 1].id;
        setTimeout(() => scrollToBottom(), 50);
      })
      .catch(() => {});
  }, [myName, scrollToBottom]);

  // Poll every 4s
  useEffect(() => {
    if (!myName) return;
    const tick = async () => {
      try {
        const since = messages.length
          ? messages[messages.length - 1].createdAt
          : new Date(0).toISOString();
        const url = `${BASE}/api/messages?since=${encodeURIComponent(since)}`;
        const data: Message[] = await fetch(url, { credentials: "include" }).then((r) => r.json());
        if (!data.length) return;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = data.filter((m) => !existingIds.has(m.id));
          if (!fresh.length) return prev;
          if (!openRef.current) {
            setUnread((u) => u + fresh.length);
          }
          return [...prev, ...fresh];
        });
      } catch {}
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [myName, messages]);

  // Auto-scroll when open or new messages arrive
  useEffect(() => {
    if (open) {
      setTimeout(() => scrollToBottom(), 60);
      setUnread(0);
    }
  }, [open, scrollToBottom]);

  useEffect(() => {
    if (atBottom && open) scrollToBottom(true);
  }, [messages, atBottom, open, scrollToBottom]);

  function handleScroll() {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setAtBottom(scrollHeight - scrollTop - clientHeight < 60);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`${BASE}/api/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => scrollToBottom(true), 30);
      }
    } catch {} finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // Group messages by day
  const grouped: { day: string; items: Message[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    if (!grouped.length || grouped[grouped.length - 1].day !== day) {
      grouped.push({ day, items: [msg] });
    } else {
      grouped[grouped.length - 1].items.push(msg);
    }
  }

  if (!myName) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
          open ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"
        } bg-primary text-primary-foreground hover:opacity-90`}
        aria-label="Open staff chat"
      >
        <MessageSquare className="w-6 h-6" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-destructive text-white text-[11px] font-black flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      <div
        className={`fixed bottom-0 right-0 z-50 flex flex-col transition-all duration-300 ease-in-out
          w-full sm:w-96 sm:right-4 sm:bottom-4 sm:rounded-2xl
          bg-card border border-border shadow-2xl overflow-hidden
          ${open ? "h-[80dvh] sm:h-[520px] opacity-100" : "h-0 opacity-0 pointer-events-none"}`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-wide text-foreground">Staff Chat</p>
            <p className="text-[11px] text-muted-foreground">Visible to all staff</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-3 space-y-4"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <MessageSquare className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest">No messages yet</p>
              <p className="text-[11px] text-muted-foreground">Say something to the team!</p>
            </div>
          )}

          {grouped.map(({ day, items }) => (
            <div key={day} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">{day}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {items.map((msg, i) => {
                const isMe = msg.staffName === myName;
                const showName = !isMe && (i === 0 || items[i - 1].staffName !== msg.staffName);
                return (
                  <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Avatar */}
                    {!isMe && (
                      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black text-white mt-0.5 ${avatarColor(msg.staffName)}`}>
                        {initials(msg.staffName)}
                      </div>
                    )}
                    <div className={`max-w-[75%] space-y-0.5 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                      {showName && (
                        <p className="text-[10px] font-bold text-muted-foreground px-1">{msg.staffName}</p>
                      )}
                      <div className={`px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                        isMe
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      }`}>
                        {msg.message}
                      </div>
                      <p className="text-[10px] text-muted-foreground px-1">{formatTime(msg.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Scroll to bottom button */}
        {!atBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 right-4 w-8 h-8 rounded-full bg-card border border-border shadow flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        )}

        {/* Input */}
        <div className="shrink-0 border-t border-border px-3 py-3 flex gap-2 bg-card">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Message the team…"
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
      </div>

      {/* Backdrop on mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
