import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft, BarChart2, TrendingUp, ShoppingBag, DollarSign,
  ChevronDown, Calendar, Filter, RefreshCw, AlertCircle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

function formatDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

type SalesItem = { name: string; category: string; qty: number; revenuePence: number };
type DayEntry = { date: string; qty: number; revenuePence: number; orders: number };
type SalesData = {
  from: string; to: string;
  totalOrders: number; totalItemsSold: number; totalRevenuePence: number;
  items: SalesItem[]; byDay: DayEntry[];
};

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

function getPresetDates(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === "today") {
    const t = fmt(now);
    return { from: t, to: t };
  }
  if (preset === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const s = fmt(y);
    return { from: s, to: s };
  }
  if (preset === "week") {
    const start = new Date(now); start.setDate(start.getDate() - 6);
    return { from: fmt(start), to: fmt(now) };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(start), to: fmt(now) };
  }
  return { from: fmt(now), to: fmt(now) };
}

const PRESET_LABELS: Record<Preset, string> = {
  today: "Today", yesterday: "Yesterday", week: "Last 7 Days", month: "This Month", custom: "Custom",
};

const CATEGORY_COLORS: Record<string, string> = {};
const PALETTE = [
  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "bg-green-500/15 text-green-400 border-green-500/30",
  "bg-pink-500/15 text-pink-400 border-pink-500/30",
  "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
];
let _colorIdx = 0;
function catColor(cat: string) {
  if (!CATEGORY_COLORS[cat]) {
    CATEGORY_COLORS[cat] = PALETTE[_colorIdx % PALETTE.length];
    _colorIdx++;
  }
  return CATEGORY_COLORS[cat];
}

export default function SalesReport() {
  const { isAdmin, isBikeManager } = useAuth();
  const canAccess = isAdmin || isBikeManager;

  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [category, setCategory] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);

  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load category list once
  useEffect(() => {
    fetch(`${BASE}/api/reports/sales/categories`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async (p: Preset, cf: string, ct: string, cat: string) => {
    const { from, to } = p === "custom" ? { from: cf, to: ct } : getPresetDates(p);
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      if (cat) qs.set("category", cat);
      const res = await fetch(`${BASE}/api/reports/sales?${qs}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch whenever filters change
  useEffect(() => {
    if (!canAccess) return;
    fetchReport(preset, customFrom, customTo, category);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, category, canAccess]);

  function applyCustom() {
    if (customFrom && customTo) {
      fetchReport("custom", customFrom, customTo, category);
    }
  }

  // Max qty for bar chart scaling
  const maxQty = data ? Math.max(...data.items.map((i) => i.qty), 1) : 1;
  const maxDay = data ? Math.max(...data.byDay.map((d) => d.qty), 1) : 1;

  if (!canAccess) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 text-center">
        <div className="space-y-2">
          <p className="text-lg font-black text-foreground">Access Denied</p>
          <Link href="/" className="text-primary text-sm underline">Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black uppercase tracking-wide">Sales Report</h1>
            <p className="text-[11px] text-muted-foreground">Products sold over time</p>
          </div>
          <button
            onClick={() => fetchReport(preset, customFrom, customTo, category)}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-12">

        {/* Filters */}
        <div className="space-y-2">
          {/* Preset picker */}
          <div className="relative">
            <button
              onClick={() => setShowPresets((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-card border border-border text-sm font-bold hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span>{PRESET_LABELS[preset]}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showPresets ? "rotate-180" : ""}`} />
            </button>
            {showPresets && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPreset(p); setShowPresets(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors ${preset === p ? "text-primary font-bold" : "text-foreground"}`}
                  >
                    {PRESET_LABELS[p]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom date range */}
          {preset === "custom" && (
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="flex-1 h-10 px-3 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-muted-foreground text-sm shrink-0">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="flex-1 h-10 px-3 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={applyCustom}
                disabled={!customFrom || !customTo}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 shrink-0"
              >
                Apply
              </button>
            </div>
          )}

          {/* Category filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                <button
                  onClick={() => setCategory("")}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${!category ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c === category ? "" : c)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${category === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/30">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-bold text-destructive">Failed to load report</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((n) => <div key={n} className="h-20 bg-card rounded-2xl animate-pulse" />)}
            </div>
            <div className="h-48 bg-card rounded-2xl animate-pulse" />
            <div className="h-64 bg-card rounded-2xl animate-pulse" />
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-2xl p-3 text-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center mx-auto">
                  <ShoppingBag className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-2xl font-black tabular-nums text-foreground">{data.totalOrders}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Orders</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-3 text-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <p className="text-2xl font-black tabular-nums text-foreground">{data.totalItemsSold}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Items Sold</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-3 text-center space-y-1">
                <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
                  <DollarSign className="w-4 h-4 text-green-400" />
                </div>
                <p className="text-lg font-black tabular-nums text-foreground">{formatPrice(data.totalRevenuePence)}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Revenue</p>
              </div>
            </div>

            {/* No data */}
            {data.items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <BarChart2 className="w-12 h-12 text-muted-foreground/20" />
                <p className="text-sm font-bold text-foreground">No sales found</p>
                <p className="text-xs text-muted-foreground">
                  No completed or paid orders for this period{category ? ` in "${category}"` : ""}.
                </p>
              </div>
            )}

            {/* Daily bar chart */}
            {data.byDay.length > 1 && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Daily Breakdown</p>
                <div className="space-y-2">
                  {data.byDay.map((day) => {
                    const pct = Math.round((day.qty / maxDay) * 100);
                    return (
                      <div key={day.date} className="flex items-center gap-3">
                        <p className="text-[11px] text-muted-foreground w-20 shrink-0">{formatDay(day.date)}</p>
                        <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                          <div
                            className="h-5 rounded-full bg-primary/70 transition-all duration-500 flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(pct, 4)}%` }}
                          >
                            <span className="text-[10px] font-black text-primary-foreground">{day.qty}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground w-20 text-right shrink-0">{formatPrice(day.revenuePence)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Product table */}
            {data.items.length > 0 && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Product Breakdown</p>
                </div>
                <div className="divide-y divide-border">
                  {data.items.map((item, idx) => {
                    const pct = Math.round((item.qty / maxQty) * 100);
                    return (
                      <div key={item.name} className="px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-muted-foreground/50 tabular-nums w-5">#{idx + 1}</span>
                              <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                            </div>
                            <span className={`mt-1 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${catColor(item.category)}`}>
                              {item.category}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-black text-foreground tabular-nums">{item.qty}</p>
                            <p className="text-[11px] text-muted-foreground">{formatPrice(item.revenuePence)}</p>
                          </div>
                        </div>
                        <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer total */}
                <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Total</p>
                  <div className="text-right">
                    <span className="text-sm font-black text-foreground mr-4 tabular-nums">{data.totalItemsSold} items</span>
                    <span className="text-sm font-black text-green-400 tabular-nums">{formatPrice(data.totalRevenuePence)}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
