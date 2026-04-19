import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Activity,
  LogIn,
  LogOut,
  ShoppingCart,
  CheckCircle2,
  Banknote,
  RotateCcw,
  Pencil,
  RefreshCw,
  Users,
  Clock,
  ClockFading,
  KeyRound,
  Utensils,
  UserPlus,
  UserMinus,
  UserCog,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";
import { useGetActivityLogs } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { format, isToday, isYesterday } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

type LogEntry = {
  id: number;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: string;
  details: Record<string, unknown> | null;
};

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

type ActionConfig = {
  label: string;
  icon: React.ReactNode;
  badgeClass: string;
};

const ACTION_CONFIG: Record<string, ActionConfig> = {
  login: {
    label: "Logged In",
    icon: <LogIn className="w-3.5 h-3.5" />,
    badgeClass: "bg-sky-500/15 border-sky-500/30 text-sky-400",
  },
  logout: {
    label: "Logged Out",
    icon: <LogOut className="w-3.5 h-3.5" />,
    badgeClass: "bg-slate-500/15 border-slate-500/30 text-slate-400",
  },
  pin_changed: {
    label: "PIN Changed",
    icon: <KeyRound className="w-3.5 h-3.5" />,
    badgeClass: "bg-purple-500/15 border-purple-500/30 text-purple-400",
  },
  order_placed: {
    label: "Order Placed",
    icon: <ShoppingCart className="w-3.5 h-3.5" />,
    badgeClass: "bg-amber-500/15 border-amber-500/30 text-amber-400",
  },
  order_direct: {
    label: "Direct Sale",
    icon: <ShoppingCart className="w-3.5 h-3.5" />,
    badgeClass: "bg-orange-500/15 border-orange-500/30 text-orange-400",
  },
  order_completed: {
    label: "Order Served",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    badgeClass: "bg-green-500/15 border-green-500/30 text-green-400",
  },
  order_paid: {
    label: "Bill Paid",
    icon: <Banknote className="w-3.5 h-3.5" />,
    badgeClass: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  },
  order_returned: {
    label: "Order Returned",
    icon: <RotateCcw className="w-3.5 h-3.5" />,
    badgeClass: "bg-red-500/15 border-red-500/30 text-red-400",
  },
  order_edited: {
    label: "Order Edited",
    icon: <Pencil className="w-3.5 h-3.5" />,
    badgeClass: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
  },
  order_resubmitted: {
    label: "Order Resubmitted",
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    badgeClass: "bg-blue-500/15 border-blue-500/30 text-blue-400",
  },
  account_settled: {
    label: "Account Settled",
    icon: <Users className="w-3.5 h-3.5" />,
    badgeClass: "bg-teal-500/15 border-teal-500/30 text-teal-400",
  },
  shift_start: {
    label: "Shift Started",
    icon: <Clock className="w-3.5 h-3.5" />,
    badgeClass: "bg-indigo-500/15 border-indigo-500/30 text-indigo-400",
  },
  shift_end: {
    label: "Shift Ended",
    icon: <ClockFading className="w-3.5 h-3.5" />,
    badgeClass: "bg-violet-500/15 border-violet-500/30 text-violet-400",
  },
  menu_item_created: {
    label: "Menu Item Added",
    icon: <Utensils className="w-3.5 h-3.5" />,
    badgeClass: "bg-lime-500/15 border-lime-500/30 text-lime-400",
  },
  menu_item_updated: {
    label: "Menu Item Updated",
    icon: <Utensils className="w-3.5 h-3.5" />,
    badgeClass: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
  },
  menu_item_deleted: {
    label: "Menu Item Deleted",
    icon: <Utensils className="w-3.5 h-3.5" />,
    badgeClass: "bg-rose-500/15 border-rose-500/30 text-rose-400",
  },
  staff_created: {
    label: "Staff Added",
    icon: <UserPlus className="w-3.5 h-3.5" />,
    badgeClass: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400",
  },
  staff_updated: {
    label: "Staff Updated",
    icon: <UserCog className="w-3.5 h-3.5" />,
    badgeClass: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
  },
  staff_deleted: {
    label: "Staff Removed",
    icon: <UserMinus className="w-3.5 h-3.5" />,
    badgeClass: "bg-rose-500/15 border-rose-500/30 text-rose-400",
  },
};

function actionConfig(action: string): ActionConfig {
  return (
    ACTION_CONFIG[action] ?? {
      label: action.replace(/_/g, " "),
      icon: <Activity className="w-3.5 h-3.5" />,
      badgeClass: "bg-muted border-border text-muted-foreground",
    }
  );
}

function formatDetails(action: string, details: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const d = details;
  switch (action) {
    case "order_placed":
    case "order_direct":
      return [
        d.customerName && `Customer: ${d.customerName}`,
        d.items && Array.isArray(d.items) && d.items.length > 0 && (d.items as string[]).join(", "),
        typeof d.totalPence === "number" && `Total: ${formatPrice(d.totalPence)}`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "order_completed":
    case "order_paid":
      return [
        d.customerName && `Customer: ${d.customerName}`,
        d.waitressName && `Waiter: ${d.waitressName}`,
        typeof d.totalPence === "number" && `Total: ${formatPrice(d.totalPence)}`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "order_returned":
      return [
        d.customerName && `Customer: ${d.customerName}`,
        d.waitressName && `Waiter: ${d.waitressName}`,
        typeof d.flaggedCount === "number" && `${d.flaggedCount} item(s) flagged`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "order_edited":
    case "order_resubmitted":
      return [
        d.customerName && `Customer: ${d.customerName}`,
        d.waitressName && `Waiter: ${d.waitressName}`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "account_settled":
      return [
        d.waitressName && `Waiter: ${d.waitressName}`,
        typeof d.batchCount === "number" && `${d.batchCount} bill(s)`,
        typeof d.totalPence === "number" && `Total: ${formatPrice(d.totalPence)}`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "menu_item_created":
      return [d.name, d.category, typeof d.pricePence === "number" && formatPrice(d.pricePence as number)]
        .filter(Boolean)
        .join(" · ");
    case "menu_item_updated":
      return d.changes
        ? `Changes: ${Object.entries(d.changes as Record<string, unknown>)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`
        : null;
    case "menu_item_deleted":
      return d.name ? `Item: ${d.name}` : null;
    case "staff_created":
    case "staff_updated":
    case "staff_deleted":
      return [d.name, d.role].filter(Boolean).join(" · ");
    default:
      return null;
  }
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (isToday(date)) return `Today ${format(date, "h:mm a")}`;
  if (isYesterday(date)) return `Yesterday ${format(date, "h:mm a")}`;
  return format(date, "dd MMM, h:mm a");
}

const ROLE_COLORS: Record<string, string> = {
  admin: "text-amber-400",
  bartender: "text-blue-400",
  waitress: "text-pink-400",
};

const ACTION_GROUPS: { label: string; actions: string[] }[] = [
  { label: "Auth", actions: ["login", "logout", "pin_changed"] },
  { label: "Orders", actions: ["order_placed", "order_direct", "order_completed", "order_paid", "order_returned", "order_edited", "order_resubmitted"] },
  { label: "Billing", actions: ["account_settled"] },
  { label: "Shifts", actions: ["shift_start", "shift_end"] },
  { label: "Admin", actions: ["menu_item_created", "menu_item_updated", "menu_item_deleted", "staff_created", "staff_updated", "staff_deleted"] },
];

export default function ActivityLog() {
  const { user } = useAuth();
  const isAdmin = (user as { role?: string } | null)?.role === "admin";

  const today = format(new Date(), "yyyy-MM-dd");
  const [filterDate, setFilterDate] = useState(today);
  const [filterActor, setFilterActor] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const params: Record<string, string> = {};
  if (filterDate) params.date = filterDate;
  if (filterActor) params.actor = filterActor;
  if (filterAction) params.action = filterAction;

  const { data: logs, isLoading, refetch, isFetching } = useGetActivityLogs(params, {
    query: { refetchInterval: 30000, enabled: isAdmin },
  });

  const actors = useMemo(() => {
    if (!logs) return [] as string[];
    const names = new Set(logs.map((l: LogEntry) => l.actorName));
    return Array.from(names).sort();
  }, [logs]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-safe">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin">
            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-black uppercase tracking-widest">Activity Log</h1>
            <p className="text-[11px] text-muted-foreground font-bold">All staff actions · Admin only</p>
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`p-1.5 rounded-lg transition-colors ${showFilters ? "bg-amber-500/20 text-amber-400" : "hover:bg-muted"}`}
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-amber-400" : ""}`} />
          </button>
        </div>

        {showFilters && (
          <div className="max-w-2xl mx-auto px-4 pb-3 flex flex-col gap-2 border-t border-border/50 pt-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wide block mb-1">Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wide block mb-1">Staff</label>
                <select
                  value={filterActor}
                  onChange={(e) => setFilterActor(e.target.value)}
                  className="w-full text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">All</option>
                  {actors.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wide block mb-1">Action</label>
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="w-full text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-amber-500/50"
                >
                  <option value="">All</option>
                  {ACTION_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.actions.map((a) => (
                        <option key={a} value={a}>
                          {actionConfig(a).label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            {(filterActor || filterAction || filterDate !== today) && (
              <button
                onClick={() => { setFilterDate(today); setFilterActor(""); setFilterAction(""); }}
                className="text-[10px] text-amber-400 font-black uppercase tracking-wide self-start"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-2">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))
        ) : !logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Activity className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-bold text-muted-foreground">No activity found</p>
            <p className="text-xs text-muted-foreground/60">Try adjusting the filters</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground font-bold text-right px-1">
              {logs.length} event{logs.length !== 1 ? "s" : ""}
            </p>
            {(logs as LogEntry[]).map((entry) => {
              const cfg = actionConfig(entry.action);
              const detail = formatDetails(entry.action, entry.details);
              const isExpanded = expandedId === entry.id;
              const hasRawDetails = entry.details && Object.keys(entry.details).length > 0;

              return (
                <div
                  key={entry.id}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  <div
                    className="px-4 py-3 flex items-start gap-3"
                    onClick={() => hasRawDetails && setExpandedId(isExpanded ? null : entry.id)}
                    role={hasRawDetails ? "button" : undefined}
                  >
                    <div className={`mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 ${cfg.badgeClass}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-black uppercase tracking-wide ${ROLE_COLORS[entry.actorRole] ?? "text-foreground"}`}>
                          {entry.actorName}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 font-bold uppercase">·</span>
                        <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${cfg.badgeClass}`}>
                          {cfg.label}
                        </span>
                      </div>
                      {detail && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{detail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <span className="text-[10px] text-muted-foreground/60 font-bold tabular-nums">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                      {hasRawDetails && (
                        isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
                      )}
                    </div>
                  </div>
                  {isExpanded && hasRawDetails && (
                    <div className="px-4 pb-3 border-t border-border/50">
                      <pre className="text-[10px] text-muted-foreground font-mono bg-muted/50 rounded-lg p-2 mt-2 overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
