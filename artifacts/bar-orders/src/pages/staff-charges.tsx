import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, CheckCircle2, Trash2, Plus, X } from "lucide-react";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

const CHARGE_TYPES = [
  { value: "breakage", label: "Breakage" },
  { value: "damage", label: "Damage" },
  { value: "cash_advance", label: "Cash Advance" },
  { value: "credit", label: "Credit" },
  { value: "other", label: "Other" },
] as const;

type ChargeTypeValue = (typeof CHARGE_TYPES)[number]["value"];

interface Charge {
  id: number;
  staffId: number;
  staffName: string;
  type: string;
  amountPence: number;
  description: string | null;
  createdAt: string;
  clearedAt: string | null;
}

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

function chargeLabel(type: string) {
  return CHARGE_TYPES.find((c) => c.value === type)?.label ?? type;
}

function chargeColor(type: string) {
  switch (type) {
    case "breakage": return "text-orange-400 bg-orange-500/10 border-orange-500/30";
    case "damage": return "text-red-400 bg-red-500/10 border-red-500/30";
    case "cash_advance": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
    case "credit": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
    default: return "text-muted-foreground bg-muted/20 border-border";
  }
}

interface StaffMember {
  id: number;
  name: string;
  role: string;
}

function AddChargeModal({
  staff,
  onClose,
  onAdded,
}: {
  staff: StaffMember[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [staffId, setStaffId] = useState<number | "">("");
  const [type, setType] = useState<ChargeTypeValue>("breakage");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const pence = Math.round(parseFloat(amount) * 100);
      const r = await fetch(`${BASE}/api/staff-charges`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: Number(staffId), type, amountPence: pence, description: description.trim() || undefined }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Charge added" });
      onAdded();
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const amountNum = parseFloat(amount);
  const canSubmit = staffId !== "" && amount && !isNaN(amountNum) && amountNum > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl p-6 space-y-4 mx-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black uppercase tracking-wider">Add Charge</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Staff Member</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select staff…</option>
              {staff.filter((s) => s.role !== "admin").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Charge Type</label>
            <div className="grid grid-cols-3 gap-2">
              {CHARGE_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setType(ct.value)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                    type === ct.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/20 text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Amount (₵)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mb-1">Description (optional)</label>
            <input
              type="text"
              placeholder="e.g. Dropped tray of glasses"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <Button
          className="w-full"
          disabled={!canSubmit || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Add Charge"}
        </Button>
      </div>
    </div>
  );
}

export default function StaffCharges() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: charges = [], isLoading } = useQuery<Charge[]>({
    queryKey: ["staff-charges"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/staff-charges`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load charges");
      return r.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  // Use admin/staff endpoint so we get roles and can filter out admin accounts
  const { data: staffList = [], isLoading: staffLoading } = useQuery<StaffMember[]>({
    queryKey: ["admin-staff-for-charges"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/staff`, { credentials: "include" });
      if (!r.ok) {
        // Fallback to public endpoint if admin endpoint fails
        const r2 = await fetch(`${BASE}/api/staff`, { credentials: "include" });
        if (!r2.ok) return [];
        return r2.json();
      }
      return r.json();
    },
    enabled: isAdmin,
    staleTime: 60000,
  });

  const clearMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/staff-charges/${id}/clear`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to clear");
    },
    onSuccess: () => {
      toast({ title: "Charge cleared" });
      qc.invalidateQueries({ queryKey: ["staff-charges"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/staff-charges/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "Charge deleted" });
      qc.invalidateQueries({ queryKey: ["staff-charges"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  // Group charges by staff name
  const grouped = charges.reduce<Record<string, Charge[]>>((acc, c) => {
    acc[c.staffName] = acc[c.staffName] ?? [];
    acc[c.staffName].push(c);
    return acc;
  }, {});

  const staffNames = Object.keys(grouped).sort();
  const totalOutstanding = charges.reduce((s, c) => s + c.amountPence, 0);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black uppercase tracking-wider">Staff Charges</h1>
          {charges.length > 0 && (
            <p className="text-xs text-muted-foreground">{charges.length} charge{charges.length !== 1 ? "s" : ""} · {formatPrice(totalOutstanding)} total outstanding</p>
          )}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} disabled={staffLoading} className="flex items-center gap-1.5 shrink-0">
          <Plus className="w-4 h-4" />
          Add Charge
        </Button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 max-w-xl mx-auto w-full">
        {isLoading && (
          <div className="text-center text-muted-foreground py-16 text-sm">Loading…</div>
        )}

        {!isLoading && charges.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
            <p className="text-sm font-semibold text-green-500">No outstanding charges</p>
            <p className="text-xs text-muted-foreground">All staff accounts are clear</p>
          </div>
        )}

        {staffNames.map((name) => {
          const staffCharges = grouped[name];
          const staffTotal = staffCharges.reduce((s, c) => s + c.amountPence, 0);
          return (
            <div key={name} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">{name}</h2>
                <span className="text-sm font-black text-amber-400 tabular-nums">{formatPrice(staffTotal)} owed</span>
              </div>
              <div className="space-y-2">
                {staffCharges.map((charge) => (
                  <div key={charge.id} className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${chargeColor(charge.type)}`}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-widest">{chargeLabel(charge.type)}</span>
                        <span className="text-xs font-black tabular-nums">{formatPrice(charge.amountPence)}</span>
                      </div>
                      {charge.description && (
                        <p className="text-xs opacity-80 mt-0.5 break-words">{charge.description}</p>
                      )}
                      <p className="text-xs opacity-60 mt-0.5">
                        {new Date(charge.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => clearMutation.mutate(charge.id)}
                        disabled={clearMutation.isPending}
                        title="Mark as cleared / paid back"
                        className="p-1.5 rounded-lg hover:bg-green-500/20 text-green-400 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(charge.id)}
                        disabled={deleteMutation.isPending}
                        title="Delete charge"
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <AddChargeModal
          staff={staffList}
          onClose={() => setShowAdd(false)}
          onAdded={() => qc.invalidateQueries({ queryKey: ["staff-charges"] })}
        />
      )}
    </div>
  );
}
