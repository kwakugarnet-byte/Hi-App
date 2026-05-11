import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft, Plus, Bike, Wrench, CircleCheck, CircleDot,
  Trash2, X, ChevronRight, AlertCircle, User, Hash,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BikeStatus = "available" | "rented" | "maintenance";
type BikeRow = {
  id: number; name: string; registration: string | null; riderName: string | null;
  color: string | null; status: string; weeklyTargetPesewas: number;
  notes: string | null; createdAt: string;
};

const STATUS_CONFIG: Record<BikeStatus, { label: string; color: string; bg: string; dot: string; icon: React.ReactNode }> = {
  available: { label: "Available", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", dot: "bg-green-400", icon: <CircleCheck className="w-3.5 h-3.5" /> },
  rented: { label: "Rented", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", dot: "bg-amber-400", icon: <CircleDot className="w-3.5 h-3.5" /> },
  maintenance: { label: "Maintenance", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", dot: "bg-red-400", icon: <Wrench className="w-3.5 h-3.5" /> },
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(`${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export default function BikesPage() {
  const { isAdmin, isBikeManager } = useAuth();
  const [, navigate] = useLocation();
  const canAccess = isAdmin || isBikeManager;

  const [bikes, setBikes] = useState<BikeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addReg, setAddReg] = useState("");
  const [addRider, setAddRider] = useState("");
  const [addColor, setAddColor] = useState("");
  const [addTarget, setAddTarget] = useState("250");
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    if (!canAccess) return;
    apiFetch<BikeRow[]>("/api/bikes")
      .then(setBikes)
      .finally(() => setLoading(false));
  }, [canAccess]);

  async function addBike() {
    if (!addName.trim() || saving) return;
    setSaving(true);
    try {
      const target = Math.round(parseFloat(addTarget) * 100) || 25000;
      const bike = await apiFetch<BikeRow>("/api/bikes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          registration: addReg.trim() || undefined,
          riderName: addRider.trim() || undefined,
          color: addColor.trim() || undefined,
          weeklyTargetPesewas: target,
        }),
      });
      setBikes((prev) => [...prev, bike]);
      setAddName(""); setAddReg(""); setAddRider(""); setAddColor(""); setAddTarget("250");
      setShowAdd(false);
    } catch {} finally { setSaving(false); }
  }

  async function deleteBike(id: number) {
    setDeletingId(id);
    try {
      await apiFetch(`/api/bikes/${id}`, { method: "DELETE" });
      setBikes((prev) => prev.filter((b) => b.id !== id));
      setConfirmDelete(null);
    } catch {} finally { setDeletingId(null); }
  }

  const counts = bikes.reduce((acc, b) => {
    acc[b.status as BikeStatus] = (acc[b.status as BikeStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<BikeStatus, number>);

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
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Bike className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black uppercase tracking-wide">Bike Management</h1>
            <p className="text-[11px] text-muted-foreground">{bikes.length} bike{bikes.length !== 1 ? "s" : ""} registered</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" /> Add Bike
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-10">

        {/* Stats */}
        {bikes.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {(["available", "rented", "maintenance"] as BikeStatus[]).map((s) => {
              const cfg = STATUS_CONFIG[s];
              return (
                <div key={s} className={`rounded-xl border px-3 py-2.5 text-center ${cfg.bg}`}>
                  <p className={`text-2xl font-black tabular-nums ${cfg.color}`}>{counts[s] ?? 0}</p>
                  <p className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${cfg.color}`}>{cfg.label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black uppercase tracking-wide">Add New Bike</p>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Bike name *" autoFocus
                className="col-span-2 h-10 px-3 rounded-xl bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
              <input value={addReg} onChange={(e) => setAddReg(e.target.value)} placeholder="Registration no."
                className="h-10 px-3 rounded-xl bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
              <input value={addColor} onChange={(e) => setAddColor(e.target.value)} placeholder="Colour (e.g. Red)"
                className="h-10 px-3 rounded-xl bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
              <input value={addRider} onChange={(e) => setAddRider(e.target.value)} placeholder="Rider name"
                className="h-10 px-3 rounded-xl bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₵</span>
                <input value={addTarget} onChange={(e) => setAddTarget(e.target.value)} type="number" min="0" placeholder="Weekly target"
                  className="h-10 w-full pl-7 pr-3 rounded-xl bg-muted border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground" />
              </div>
            </div>
            <button onClick={addBike} disabled={!addName.trim() || saving}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 hover:opacity-90">
              {saving ? "Adding…" : "Add Bike"}
            </button>
          </div>
        )}

        {/* Bike list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => <div key={n} className="h-20 bg-card rounded-2xl animate-pulse" />)}
          </div>
        ) : bikes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Bike className="w-12 h-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No bikes registered yet.</p>
            <button onClick={() => setShowAdd(true)} className="text-primary text-sm font-bold hover:underline">Add your first bike</button>
          </div>
        ) : (
          <div className="space-y-3">
            {bikes.map((bike) => {
              const cfg = STATUS_CONFIG[bike.status as BikeStatus] ?? STATUS_CONFIG.available;
              const isConfirming = confirmDelete === bike.id;
              return (
                <div key={bike.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => navigate(`/bikes/${bike.id}`)}
                    className="w-full p-4 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <Bike className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-black text-sm truncate">{bike.name}</p>
                        {bike.color && (
                          <span className="text-[10px] text-muted-foreground">· {bike.color}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {bike.registration && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Hash className="w-3 h-3" />{bike.registration}
                          </span>
                        )}
                        {bike.riderName && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="w-3 h-3" />{bike.riderName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase ${cfg.bg} ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>

                  {isAdmin && (
                    <div className="border-t border-border px-4 py-2 flex items-center justify-end">
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Delete this bike?</span>
                          <button onClick={() => deleteBike(bike.id)} disabled={deletingId === bike.id}
                            className="px-2.5 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-50">
                            {deletingId === bike.id ? "…" : "Yes, delete"}
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="px-2.5 py-1 rounded-lg border border-border text-xs text-muted-foreground">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(bike.id); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
