import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft, Bike, Wrench, CircleCheck, CircleDot, Plus, X, Trash2,
  TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle2,
  User, Hash, Palette, Target, ChevronDown, Save, UserPlus,
  CalendarRange, DollarSign, PenLine,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "overview" | "income" | "expenses" | "settings";
type Period = "week" | "month" | "year" | "all" | "custom";
type BikeStatus = "available" | "rented" | "maintenance";

type BikeDetail = {
  id: number; name: string; registration: string | null; riderName: string | null;
  color: string | null; status: string; weeklyTargetPesewas: number;
  notes: string | null; createdAt: string;
};
type IncomeEntry = {
  id: number; bikeId: number; amountPesewas: number; weekStart: string;
  note: string | null; deposited: boolean; depositedAt: string | null; createdAt: string;
};
type ExpenseEntry = {
  id: number; bikeId: number; amountPesewas: number; category: string;
  description: string; date: string; createdAt: string;
};
type AssignmentEntry = {
  id: number; bikeId: number; staffId: number; staffName: string | null;
  staffRole: string | null; canEditDetails: boolean; canEditPrice: boolean; createdAt: string;
};
type StaffEntry = { id: number; name: string; role: string };

const STATUS_CONFIG: Record<BikeStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  available: { label: "Available", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: <CircleCheck className="w-3.5 h-3.5" /> },
  rented: { label: "Rented", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", icon: <CircleDot className="w-3.5 h-3.5" /> },
  maintenance: { label: "Maintenance", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: <Wrench className="w-3.5 h-3.5" /> },
};

const EXPENSE_CATEGORIES = [
  { value: "maintenance", label: "Maintenance", color: "text-red-400 bg-red-500/10" },
  { value: "fuel", label: "Fuel", color: "text-orange-400 bg-orange-500/10" },
  { value: "other", label: "Other", color: "text-muted-foreground bg-muted" },
];

function fmt(pesewas: number) { return `₵${(pesewas / 100).toFixed(2)}`; }

function getToday() { return new Date().toISOString().split("T")[0]; }
function getWeekStart(d = new Date()) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().split("T")[0];
}
function getMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function getYearStart() { return `${new Date().getFullYear()}-01-01`; }

function formatDate(s: string) {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatWeekRange(weekStart: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startStr = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${startStr} – ${endStr}`;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(`${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Period filter helpers ────────────────────────────────────────────────────
function getPeriodBounds(period: Period, customFrom: string, customTo: string): [string, string] | null {
  if (period === "all") return null;
  if (period === "custom") return [customFrom, customTo];
  const today = getToday();
  if (period === "week") return [getWeekStart(), today];
  if (period === "month") return [getMonthStart(), today];
  if (period === "year") return [getYearStart(), today];
  return null;
}

function filterByDateField(items: { date?: string; weekStart?: string }[], field: "date" | "weekStart", bounds: [string, string] | null) {
  if (!bounds) return items;
  const [from, to] = bounds;
  return items.filter((i) => {
    const d = (i as Record<string, string>)[field];
    return d >= from && d <= to;
  });
}

// ─── Input component ──────────────────────────────────────────────────────────
function Input({ value, onChange, placeholder, type = "text", prefix, autoFocus, onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; prefix?: string; autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">{prefix}</span>}
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        type={type} autoFocus={autoFocus} onKeyDown={onKeyDown}
        className={`w-full h-10 ${prefix ? "pl-7" : "pl-3"} pr-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary`}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BikeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const bikeId = parseInt(id ?? "", 10);
  const { isAdmin, isBikeManager } = useAuth();
  const canAccess = isAdmin || isBikeManager;

  const [bike, setBike] = useState<BikeDetail | null>(null);
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [assignments, setAssignments] = useState<AssignmentEntry[]>([]);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  // Period filter (shared across overview/income/expenses)
  const [period, setPeriod] = useState<Period>("week");
  const [customFrom, setCustomFrom] = useState(getWeekStart());
  const [customTo, setCustomTo] = useState(getToday());

  // ── Add Income form
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incAmt, setIncAmt] = useState("");
  const [incWeek, setIncWeek] = useState(getWeekStart());
  const [incNote, setIncNote] = useState("");
  const [incSaving, setIncSaving] = useState(false);

  // ── Add Expense form
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expAmt, setExpAmt] = useState("");
  const [expCat, setExpCat] = useState("maintenance");
  const [expDesc, setExpDesc] = useState("");
  const [expDate, setExpDate] = useState(getToday());
  const [expSaving, setExpSaving] = useState(false);

  // ── Settings / edit bike
  const [editName, setEditName] = useState("");
  const [editReg, setEditReg] = useState("");
  const [editRider, setEditRider] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<BikeStatus>("available");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ── Add Assignment
  const [showAddAssign, setShowAddAssign] = useState(false);
  const [assignStaffId, setAssignStaffId] = useState<number | null>(null);
  const [assignDetails, setAssignDetails] = useState(false);
  const [assignPrice, setAssignPrice] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  // ── Deposit / delete
  const [depositingId, setDepositingId] = useState<number | null>(null);
  const [deleteIncomeId, setDeleteIncomeId] = useState<number | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null);
  const [deleteAssignId, setDeleteAssignId] = useState<number | null>(null);

  // ── Load data
  useEffect(() => {
    if (isNaN(bikeId) || !canAccess) { setLoading(false); return; }
    Promise.all([
      apiFetch<BikeDetail>(`/api/bikes/${bikeId}`),
      apiFetch<IncomeEntry[]>(`/api/bikes/${bikeId}/income`),
      apiFetch<ExpenseEntry[]>(`/api/bikes/${bikeId}/expenses`),
      apiFetch<AssignmentEntry[]>(`/api/bikes/${bikeId}/assignments`),
      isAdmin ? apiFetch<StaffEntry[]>("/api/bikes/staff") : Promise.resolve([]),
    ]).then(([b, inc, exp, asgn, stf]) => {
      setBike(b); setIncome(inc); setExpenses(exp); setAssignments(asgn); setStaff(stf);
      setEditName(b.name);
      setEditReg(b.registration ?? "");
      setEditRider(b.riderName ?? "");
      setEditColor(b.color ?? "");
      setEditTarget(((b.weeklyTargetPesewas ?? 25000) / 100).toFixed(0));
      setEditNotes(b.notes ?? "");
      setEditStatus((b.status as BikeStatus) ?? "available");
    }).catch(() => {}).finally(() => setLoading(false));
  }, [bikeId, canAccess, isAdmin]);

  // ── Computed
  const bounds = useMemo(() => getPeriodBounds(period, customFrom, customTo), [period, customFrom, customTo]);
  const filteredIncome = useMemo(() => filterByDateField(income, "weekStart", bounds) as IncomeEntry[], [income, bounds]);
  const filteredExpenses = useMemo(() => filterByDateField(expenses, "date", bounds) as ExpenseEntry[], [expenses, bounds]);
  const totalIn = useMemo(() => filteredIncome.reduce((s, i) => s + i.amountPesewas, 0), [filteredIncome]);
  const totalOut = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amountPesewas, 0), [filteredExpenses]);
  const netProfit = totalIn - totalOut;

  const thisWeekStart = getWeekStart();
  const thisWeekIncome = income.filter((i) => i.weekStart === thisWeekStart).reduce((s, i) => s + i.amountPesewas, 0);
  const weekTarget = bike?.weeklyTargetPesewas ?? 25000;
  const weekPct = Math.min(100, Math.round((thisWeekIncome / weekTarget) * 100));

  const pendingDeposits = income.filter((i) => !i.deposited);
  const pendingTotal = pendingDeposits.reduce((s, i) => s + i.amountPesewas, 0);

  // ── Actions
  async function addIncome() {
    const amt = Math.round(parseFloat(incAmt) * 100);
    if (!amt || amt <= 0 || incSaving) return;
    setIncSaving(true);
    try {
      const row = await apiFetch<IncomeEntry>(`/api/bikes/${bikeId}/income`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPesewas: amt, weekStart: incWeek, note: incNote.trim() || undefined }),
      });
      setIncome((prev) => [row, ...prev]);
      setIncAmt(""); setIncNote(""); setIncWeek(getWeekStart()); setShowAddIncome(false);
    } catch {} finally { setIncSaving(false); }
  }

  async function markDeposited(id: number) {
    setDepositingId(id);
    try {
      const updated = await apiFetch<IncomeEntry>(`/api/bikes/income/${id}/deposit`, { method: "PATCH" });
      setIncome((prev) => prev.map((i) => i.id === id ? updated : i));
    } catch {} finally { setDepositingId(null); }
  }

  async function deleteIncome(id: number) {
    try {
      await apiFetch(`/api/bikes/income/${id}`, { method: "DELETE" });
      setIncome((prev) => prev.filter((i) => i.id !== id));
      setDeleteIncomeId(null);
    } catch {}
  }

  async function addExpense() {
    const amt = Math.round(parseFloat(expAmt) * 100);
    if (!amt || amt <= 0 || !expDesc.trim() || expSaving) return;
    setExpSaving(true);
    try {
      const row = await apiFetch<ExpenseEntry>(`/api/bikes/${bikeId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPesewas: amt, category: expCat, description: expDesc.trim(), date: expDate }),
      });
      setExpenses((prev) => [row, ...prev]);
      setExpAmt(""); setExpDesc(""); setExpCat("maintenance"); setExpDate(getToday()); setShowAddExpense(false);
    } catch {} finally { setExpSaving(false); }
  }

  async function deleteExpense(id: number) {
    try {
      await apiFetch(`/api/bikes/expenses/${id}`, { method: "DELETE" });
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      setDeleteExpenseId(null);
    } catch {}
  }

  async function saveSettings() {
    if (!editName.trim() || settingsSaving) return;
    setSettingsSaving(true);
    try {
      const target = Math.round(parseFloat(editTarget) * 100) || 25000;
      const updated = await apiFetch<BikeDetail>(`/api/bikes/${bikeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(), registration: editReg.trim() || "",
          riderName: editRider.trim() || "", color: editColor.trim() || "",
          notes: editNotes.trim() || "", weeklyTargetPesewas: target, status: editStatus,
        }),
      });
      setBike(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch {} finally { setSettingsSaving(false); }
  }

  async function addAssignment() {
    if (!assignStaffId || assignSaving) return;
    setAssignSaving(true);
    try {
      const row = await apiFetch<AssignmentEntry>(`/api/bikes/${bikeId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: assignStaffId, canEditDetails: assignDetails, canEditPrice: assignPrice }),
      });
      setAssignments((prev) => [...prev, row]);
      setAssignStaffId(null); setAssignDetails(false); setAssignPrice(false); setShowAddAssign(false);
    } catch {} finally { setAssignSaving(false); }
  }

  async function toggleAssignPerm(id: number, field: "canEditDetails" | "canEditPrice", current: boolean) {
    try {
      const updated = await apiFetch<AssignmentEntry>(`/api/bikes/assignments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !current }),
      });
      setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, ...updated } : a));
    } catch {}
  }

  async function removeAssignment(id: number) {
    try {
      await apiFetch(`/api/bikes/assignments/${id}`, { method: "DELETE" });
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      setDeleteAssignId(null);
    } catch {}
  }

  // ── UI helpers
  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "income", label: "Income" },
    { key: "expenses", label: "Expenses" },
    { key: "settings", label: "Settings" },
  ];

  const PERIODS: { key: Period; label: string }[] = [
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "year", label: "Year" },
    { key: "all", label: "All" },
    { key: "custom", label: "Custom" },
  ];

  const statusCfg = STATUS_CONFIG[bike?.status as BikeStatus] ?? STATUS_CONFIG.available;

  if (!canAccess) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 text-center">
        <div className="space-y-2">
          <p className="text-lg font-black">Access Denied</p>
          <Link href="/bikes" className="text-primary text-sm underline">Back to bikes</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <div className="h-12 bg-card rounded-xl animate-pulse" />
          <div className="h-32 bg-card rounded-2xl animate-pulse" />
          <div className="h-48 bg-card rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!bike) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 text-center">
        <div className="space-y-2">
          <p className="font-black text-lg">Bike not found</p>
          <Link href="/bikes" className="text-primary text-sm underline">Back to bikes</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/bikes">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${statusCfg.bg}`}>
            <Bike className={`w-5 h-5 ${statusCfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black truncate">{bike.name}</h1>
              {bike.color && <span className="text-xs text-muted-foreground hidden sm:block">· {bike.color}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {bike.registration && <span className="text-[11px] text-muted-foreground">{bike.registration}</span>}
              {bike.riderName && <span className="text-[11px] text-muted-foreground">· {bike.riderName}</span>}
            </div>
          </div>
          <span className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase shrink-0 ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.icon}{statusCfg.label}
          </span>
        </div>

        {/* Tab bar */}
        <div className="max-w-lg mx-auto px-4 flex border-t border-border">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wide transition-colors ${
                tab === t.key ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Period filter (not on settings) ── */}
      {tab !== "settings" && (
        <div className="sticky top-[89px] z-10 bg-background border-b border-border/50">
          <div className="max-w-lg mx-auto px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  period === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="max-w-lg mx-auto px-4 pb-2 flex gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="flex-1 h-9 px-3 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              <span className="self-center text-muted-foreground text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="flex-1 h-9 px-3 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          )}
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-16">

        {/* ════════════════════════════════ OVERVIEW ════════════════════════════════ */}
        {tab === "overview" && (
          <>
            {/* This week progress */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">This Week's Target</p>
                <Target className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <span className={`text-3xl font-black tabular-nums ${weekPct >= 100 ? "text-green-400" : weekPct >= 60 ? "text-amber-400" : "text-red-400"}`}>
                      {fmt(thisWeekIncome)}
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">/ {fmt(weekTarget)}</span>
                  </div>
                  <span className={`text-sm font-black ${weekPct >= 100 ? "text-green-400" : weekPct >= 60 ? "text-amber-400" : "text-red-400"}`}>
                    {weekPct}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${weekPct >= 100 ? "bg-green-400" : weekPct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${weekPct}%` }}
                  />
                </div>
                {thisWeekIncome < weekTarget && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {fmt(weekTarget - thisWeekIncome)} short of target
                  </p>
                )}
              </div>
            </div>

            {/* Pending deposits */}
            {pendingDeposits.length > 0 && (
              <button onClick={() => { setTab("income"); }}
                className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-amber-500/15 transition-colors">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-amber-400">Pending Deposits</p>
                  <p className="text-xs text-amber-400/70">{pendingDeposits.length} entr{pendingDeposits.length !== 1 ? "ies" : "y"} totalling {fmt(pendingTotal)}</p>
                </div>
                <span className="text-amber-400 text-xs font-bold">View →</span>
              </button>
            )}

            {/* Period summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-2xl p-3 text-center">
                <TrendingUp className="w-4 h-4 text-green-400 mx-auto mb-1" />
                <p className="text-lg font-black text-green-400 tabular-nums">{fmt(totalIn)}</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide mt-0.5">Income</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-3 text-center">
                <TrendingDown className="w-4 h-4 text-red-400 mx-auto mb-1" />
                <p className="text-lg font-black text-red-400 tabular-nums">{fmt(totalOut)}</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide mt-0.5">Expenses</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-3 text-center">
                <Wallet className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className={`text-lg font-black tabular-nums ${netProfit >= 0 ? "text-primary" : "text-red-400"}`}>{fmt(netProfit)}</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide mt-0.5">Net</p>
              </div>
            </div>

            {/* Quick recent income */}
            {income.slice(0, 5).length > 0 && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Recent Income</p>
                  <button onClick={() => setTab("income")} className="text-primary text-xs font-bold">View all</button>
                </div>
                {income.slice(0, 5).map((i) => (
                  <div key={i.id} className="px-4 py-3 flex items-center gap-3 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">{formatWeekRange(i.weekStart)}</p>
                      {i.note && <p className="text-xs text-muted-foreground truncate">{i.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black tabular-nums">{fmt(i.amountPesewas)}</p>
                      <span className={`text-[10px] font-bold ${i.deposited ? "text-green-400" : "text-amber-400"}`}>
                        {i.deposited ? "Deposited" : "Pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════ INCOME ════════════════════════════════ */}
        {tab === "income" && (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-green-500/20 rounded-xl p-3 text-center">
                <p className="text-lg font-black text-green-400 tabular-nums">{fmt(totalIn)}</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase mt-0.5">Total Income</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${pendingTotal > 0 ? "bg-amber-500/10 border border-amber-500/30" : "bg-card border border-border"}`}>
                <p className={`text-lg font-black tabular-nums ${pendingTotal > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{fmt(pendingTotal)}</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase mt-0.5">Pending Deposit</p>
              </div>
            </div>

            {/* Add form */}
            {showAddIncome ? (
              <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black uppercase tracking-wide">Add Income Entry</p>
                  <button onClick={() => setShowAddIncome(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Amount (₵) *</label>
                    <Input value={incAmt} onChange={setIncAmt} type="number" placeholder="0.00" prefix="₵" autoFocus />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Week start (Monday)</label>
                    <input type="date" value={incWeek} onChange={(e) => setIncWeek(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Note (optional — e.g. "short, rider was ill")</label>
                  <Input value={incNote} onChange={setIncNote} placeholder="Any notes about this week…" />
                </div>
                <button onClick={addIncome} disabled={!incAmt || incSaving}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 hover:opacity-90">
                  {incSaving ? "Saving…" : "Add Income"}
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAddIncome(true)}
                className="w-full h-11 rounded-xl border border-dashed border-primary/40 text-primary text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors">
                <Plus className="w-4 h-4" /> Add Income Entry
              </button>
            )}

            {/* Income list */}
            {filteredIncome.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No income entries for this period.</div>
            ) : (
              <div className="space-y-2">
                {filteredIncome.map((entry) => (
                  <div key={entry.id} className={`bg-card border rounded-2xl overflow-hidden ${!entry.deposited ? "border-amber-500/30" : "border-border"}`}>
                    <div className="p-4 flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${entry.deposited ? "bg-green-500/10" : "bg-amber-500/10"}`}>
                        <DollarSign className={`w-4 h-4 ${entry.deposited ? "text-green-400" : "text-amber-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold">{formatWeekRange(entry.weekStart)}</p>
                        {entry.note && <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>}
                        {entry.deposited && entry.depositedAt && (
                          <p className="text-[11px] text-green-400 mt-0.5">Deposited {formatDate(entry.depositedAt.split("T")[0])}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-black tabular-nums">{fmt(entry.amountPesewas)}</p>
                        {entry.amountPesewas < weekTarget && (
                          <p className="text-[10px] text-red-400">{fmt(weekTarget - entry.amountPesewas)} short</p>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                      {!entry.deposited ? (
                        <button onClick={() => markDeposited(entry.id)} disabled={depositingId === entry.id}
                          className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {depositingId === entry.id ? "Marking…" : "Mark as Deposited"}
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Deposited
                        </span>
                      )}
                      {isAdmin && (
                        deleteIncomeId === entry.id ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => deleteIncome(entry.id)} className="text-xs text-destructive font-bold">Delete</button>
                            <button onClick={() => setDeleteIncomeId(null)} className="text-xs text-muted-foreground">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteIncomeId(entry.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════ EXPENSES ════════════════════════════════ */}
        {tab === "expenses" && (
          <>
            {/* Summary */}
            <div className="bg-card border border-red-500/20 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground font-bold uppercase">Total Expenses</p>
                <p className="text-xl font-black text-red-400 tabular-nums">{fmt(totalOut)}</p>
              </div>
              <TrendingDown className="w-6 h-6 text-red-400/40" />
            </div>

            {/* Add form */}
            {showAddExpense ? (
              <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black uppercase tracking-wide">Log Expense</p>
                  <button onClick={() => setShowAddExpense(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Amount (₵) *</label>
                    <Input value={expAmt} onChange={setExpAmt} type="number" placeholder="0.00" prefix="₵" autoFocus />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Date *</label>
                    <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Category</label>
                  <div className="flex gap-2">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <button key={c.value} onClick={() => setExpCat(c.value)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          expCat === c.value ? `${c.color} border-transparent` : "border-border text-muted-foreground hover:text-foreground"
                        }`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Description — work done / details *</label>
                  <textarea value={expDesc} onChange={(e) => setExpDesc(e.target.value)}
                    placeholder="Describe the work done or reason for expense…"
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>
                <button onClick={addExpense} disabled={!expAmt || !expDesc.trim() || expSaving}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 hover:opacity-90">
                  {expSaving ? "Saving…" : "Log Expense"}
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAddExpense(true)}
                className="w-full h-11 rounded-xl border border-dashed border-primary/40 text-primary text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors">
                <Plus className="w-4 h-4" /> Log Expense
              </button>
            )}

            {/* Expense list */}
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No expenses for this period.</div>
            ) : (
              <div className="space-y-2">
                {filteredExpenses.map((entry) => {
                  const catCfg = EXPENSE_CATEGORIES.find((c) => c.value === entry.category) ?? EXPENSE_CATEGORIES[2];
                  return (
                    <div key={entry.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="p-4 flex items-start gap-3">
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${catCfg.color}`}>{catCfg.label}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold leading-snug">{entry.description}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(entry.date)}</p>
                        </div>
                        <p className="text-base font-black text-red-400 tabular-nums shrink-0">{fmt(entry.amountPesewas)}</p>
                      </div>
                      {isAdmin && (
                        <div className="border-t border-border px-4 py-2 flex justify-end">
                          {deleteExpenseId === entry.id ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => deleteExpense(entry.id)} className="text-xs text-destructive font-bold">Delete</button>
                              <button onClick={() => setDeleteExpenseId(null)} className="text-xs text-muted-foreground">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteExpenseId(entry.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════ SETTINGS ════════════════════════════════ */}
        {tab === "settings" && (
          <>
            {/* Bike details */}
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Bike Details</p>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Bike Name *</label>
                  <Input value={editName} onChange={setEditName} placeholder="Bike name" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Registration No.</label>
                    <Input value={editReg} onChange={setEditReg} placeholder="e.g. GR-1234-24" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Colour</label>
                    <Input value={editColor} onChange={setEditColor} placeholder="e.g. Red" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Rider Name</label>
                    <Input value={editRider} onChange={setEditRider} placeholder="Rider's name" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Weekly Target (₵)</label>
                    <Input value={editTarget} onChange={setEditTarget} type="number" placeholder="250" prefix="₵" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Status</label>
                  <div className="flex gap-2">
                    {(["available", "rented", "maintenance"] as BikeStatus[]).map((s) => {
                      const c = STATUS_CONFIG[s];
                      return (
                        <button key={s} onClick={() => setEditStatus(s)}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border text-[11px] font-bold uppercase transition-colors ${
                            editStatus === s ? `${c.bg} ${c.color} border-transparent` : "border-border text-muted-foreground hover:text-foreground"
                          }`}>
                          {c.icon}{c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Notes</label>
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} placeholder="Any notes about this bike…"
                    className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>
              </div>
              <button onClick={saveSettings} disabled={!editName.trim() || settingsSaving}
                className={`w-full h-10 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-2 ${
                  settingsSaved ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:opacity-90"
                }`}>
                {settingsSaved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : settingsSaving ? "Saving…" : <><Save className="w-4 h-4" /> Save Changes</>}
              </button>
            </div>

            {/* Assignments (admin only) */}
            {isAdmin && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">Worker Assignments</p>
                  <button onClick={() => setShowAddAssign(!showAddAssign)}
                    className="flex items-center gap-1 text-xs text-primary font-bold">
                    <UserPlus className="w-3.5 h-3.5" /> Assign Worker
                  </button>
                </div>

                {showAddAssign && (
                  <div className="bg-muted rounded-xl p-3 space-y-3 border border-border">
                    <div>
                      <label className="text-[10px] text-muted-foreground font-bold uppercase mb-1 block">Select Staff Member</label>
                      <select value={assignStaffId ?? ""} onChange={(e) => setAssignStaffId(Number(e.target.value) || null)}
                        className="w-full h-10 px-3 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="">— choose staff —</option>
                        {staff.filter((s) => !assignments.find((a) => a.staffId === s.id)).map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">Permissions</p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={assignDetails} onChange={(e) => setAssignDetails(e.target.checked)}
                          className="w-4 h-4 rounded accent-primary" />
                        <span className="text-sm">Can edit bike details (name, registration, rider, colour)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={assignPrice} onChange={(e) => setAssignPrice(e.target.checked)}
                          className="w-4 h-4 rounded accent-primary" />
                        <span className="text-sm">Can change weekly target / pricing</span>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addAssignment} disabled={!assignStaffId || assignSaving}
                        className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 hover:opacity-90">
                        {assignSaving ? "Assigning…" : "Assign"}
                      </button>
                      <button onClick={() => setShowAddAssign(false)}
                        className="flex-1 h-9 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {assignments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No workers assigned to this bike.</p>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold">{a.staffName ?? "Unknown"}</p>
                          <p className="text-[11px] text-muted-foreground">{a.staffRole}</p>
                          <div className="flex gap-2 mt-1.5 flex-wrap">
                            <button onClick={() => toggleAssignPerm(a.id, "canEditDetails", a.canEditDetails)}
                              className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${
                                a.canEditDetails ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                              }`}>
                              Edit Details {a.canEditDetails ? "✓" : "✗"}
                            </button>
                            <button onClick={() => toggleAssignPerm(a.id, "canEditPrice", a.canEditPrice)}
                              className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition-colors ${
                                a.canEditPrice ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                              }`}>
                              Edit Price {a.canEditPrice ? "✓" : "✗"}
                            </button>
                          </div>
                        </div>
                        {deleteAssignId === a.id ? (
                          <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => removeAssignment(a.id)} className="text-[10px] text-destructive font-bold">Remove</button>
                            <button onClick={() => setDeleteAssignId(null)} className="text-[10px] text-muted-foreground">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteAssignId(a.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
