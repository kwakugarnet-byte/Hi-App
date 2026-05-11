import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Plus, Bike, Wrench, CircleCheck, CircleDot, Trash2, X, Save, PenLine } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BikeStatus = "available" | "rented" | "maintenance";
type Bike = { id: number; name: string; status: string; notes: string | null; createdAt: string };

const STATUS_CONFIG: Record<BikeStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  available: {
    label: "Available",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
    icon: <CircleCheck className="w-4 h-4 text-green-400" />,
  },
  rented: {
    label: "Rented",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    icon: <CircleDot className="w-4 h-4 text-amber-400" />,
  },
  maintenance: {
    label: "Maintenance",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    icon: <Wrench className="w-4 h-4 text-red-400" />,
  },
};

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(`${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export default function BikesPage() {
  const { isAdmin, isBikeManager } = useAuth();
  const canAccess = isAdmin || isBikeManager;

  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load bikes on mount
  useState(() => {
    if (!canAccess) return;
    setLoading(true);
    apiFetch<Bike[]>("/api/bikes")
      .then((data) => { setBikes(data); setLoaded(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  async function addBike() {
    if (!addName.trim() || saving) return;
    setSaving(true);
    try {
      const bike = await apiFetch<Bike>("/api/bikes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), notes: addNotes.trim() || undefined }),
      });
      setBikes((prev) => [...prev, bike]);
      setAddName("");
      setAddNotes("");
      setShowAdd(false);
    } catch {} finally { setSaving(false); }
  }

  async function updateStatus(id: number, status: BikeStatus) {
    try {
      const updated = await apiFetch<Bike>(`/api/bikes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setBikes((prev) => prev.map((b) => b.id === id ? updated : b));
    } catch {}
  }

  function startEdit(bike: Bike) {
    setEditingId(bike.id);
    setEditName(bike.name);
    setEditNotes(bike.notes ?? "");
  }

  async function saveEdit(id: number) {
    if (!editName.trim() || editSaving) return;
    setEditSaving(true);
    try {
      const updated = await apiFetch<Bike>(`/api/bikes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), notes: editNotes.trim() || "" }),
      });
      setBikes((prev) => prev.map((b) => b.id === id ? updated : b));
      setEditingId(null);
    } catch {} finally { setEditSaving(false); }
  }

  async function deleteBike(id: number) {
    setDeletingId(id);
    try {
      await apiFetch(`/api/bikes/${id}`, { method: "DELETE" });
      setBikes((prev) => prev.filter((b) => b.id !== id));
    } catch {} finally { setDeletingId(null); }
  }

  const counts = bikes.reduce(
    (acc, b) => { acc[b.status as BikeStatus] = (acc[b.status as BikeStatus] ?? 0) + 1; return acc; },
    {} as Record<BikeStatus, number>
  );

  if (!canAccess) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 text-center">
        <div className="space-y-2">
          <p className="text-lg font-black text-foreground">Access Denied</p>
          <p className="text-sm text-muted-foreground">You need Bike Manager or Admin access.</p>
          <Link href="/" className="text-primary text-sm underline">Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Bike className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-black uppercase tracking-wide text-foreground">Bike Management</h1>
            <p className="text-[11px] text-muted-foreground">{bikes.length} bike{bikes.length !== 1 ? "s" : ""} registered</p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setAddName(""); setAddNotes(""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Bike
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5 pb-10">

        {/* Stats row */}
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

        {/* Add bike form */}
        {showAdd && (
          <div className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black uppercase tracking-wide text-foreground">Add New Bike</p>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBike()}
              placeholder="Bike name or number (e.g. Bike #1, Trek 3500)"
              className="w-full h-10 px-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <input
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Notes (optional — colour, size, etc.)"
              className="w-full h-10 px-3 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addBike}
              disabled={!addName.trim() || saving}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {saving ? "Adding…" : "Add Bike"}
            </button>
          </div>
        )}

        {/* Bike list */}
        {loading && !loaded ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => <div key={n} className="h-20 bg-card rounded-2xl animate-pulse" />)}
          </div>
        ) : bikes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Bike className="w-12 h-12 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No bikes registered yet.</p>
            <button
              onClick={() => setShowAdd(true)}
              className="text-primary text-sm font-bold hover:underline"
            >
              Add your first bike
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {bikes.map((bike) => {
              const cfg = STATUS_CONFIG[bike.status as BikeStatus] ?? STATUS_CONFIG.available;
              const isEditing = editingId === bike.id;
              return (
                <div key={bike.id} className={`bg-card border rounded-2xl p-4 space-y-3 transition-colors ${isEditing ? "border-primary/40" : "border-border"}`}>
                  {isEditing ? (
                    /* Edit mode */
                    <div className="space-y-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit(bike.id)}
                        className="w-full h-9 px-3 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        autoFocus
                      />
                      <input
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notes…"
                        className="w-full h-9 px-3 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(bike.id)}
                          disabled={!editName.trim() || editSaving}
                          className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 hover:opacity-90 flex items-center justify-center gap-1"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 h-9 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${cfg.bg}`}>
                          <Bike className={`w-4 h-4 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm text-foreground">{bike.name}</p>
                          {bike.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">{bike.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEdit(bike)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                          >
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => deleteBike(bike.id)}
                              disabled={deletingId === bike.id}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Status switcher */}
                      <div className="flex gap-2">
                        {(["available", "rented", "maintenance"] as BikeStatus[]).map((s) => {
                          const c = STATUS_CONFIG[s];
                          const active = bike.status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => !active && updateStatus(bike.id, s)}
                              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border text-[11px] font-black uppercase tracking-wide transition-colors ${
                                active
                                  ? `${c.bg} ${c.color} border-transparent`
                                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                              }`}
                            >
                              {c.icon}
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
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
