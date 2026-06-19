import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Percent, ShieldCheck, ChevronDown, Crown } from "lucide-react";
import {
  useGetAdminStaff,
  useCreateStaff,
  useUpdateStaff,
  useDeleteStaff,
  getGetAdminStaffQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";

const ROLES = ["waitress", "bartender", "bike_manager", "admin"] as const;

const ALL_PERMISSIONS = [
  { key: "manage_products",   label: "Add & edit products",       group: "Products" },
  { key: "change_prices",     label: "Change product prices",     group: "Products" },
  { key: "delete_products",   label: "Delete products",           group: "Products" },
  { key: "manage_categories", label: "Manage menu categories",    group: "Menu" },
  { key: "manage_staff",      label: "Manage staff accounts",     group: "Staff" },
  { key: "view_activity",     label: "View activity log",         group: "Reports" },
  { key: "access_bikes",      label: "Access bike management",    group: "Bikes" },
] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<Role, string> = {
  waitress: "Waitress",
  bartender: "Bartender",
  bike_manager: "Bike Manager",
  admin: "Admin",
};

const ROLE_COLOR: Record<Role, string> = {
  waitress: "bg-amber-500/20 text-amber-400",
  bartender: "bg-blue-500/20 text-blue-400",
  bike_manager: "bg-teal-500/20 text-teal-400",
  admin: "bg-primary/20 text-primary",
};

const PERM_GROUPS = Array.from(
  ALL_PERMISSIONS.reduce((map, p) => {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push(p);
    return map;
  }, new Map<string, { key: string; label: string; group: string }[]>())
);

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="number"
      min="0"
      max="9999"
      placeholder="4-digit PIN"
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
        onChange(v);
      }}
      className="w-32 bg-background border-border focus-visible:ring-primary text-center tracking-widest font-mono"
    />
  );
}

type AddState = { name: string; role: Role; pin: string; bonusPercent: string };
type EditState = { id: number; name: string; role: Role; pin: string; bonusPercent: string };
type Tab = "staff" | "bonus" | "permissions";

function AdminStaffInner() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: staff, isLoading } = useGetAdminStaff({
    query: { queryKey: getGetAdminStaffQueryKey() },
  });

  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();

  const [tab, setTab] = useState<Tab>("staff");
  const [adding, setAdding] = useState<AddState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const [bonusEdits, setBonusEdits] = useState<Record<number, string>>({});
  const [savingBonus, setSavingBonus] = useState(false);

  // Permissions tab state
  const [expandedPermStaff, setExpandedPermStaff] = useState<number | null>(null);
  const [staffPermsMap, setStaffPermsMap] = useState<Record<number, string[]>>({});
  const [loadingPermsFor, setLoadingPermsFor] = useState<Set<number>>(new Set());
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  // VIP Customers state
  const [vipCustomers, setVipCustomers] = useState<{ id: number; name: string }[]>([]);
  const [vipLoading, setVipLoading] = useState(false);
  const [newVipName, setNewVipName] = useState("");
  const [savingVip, setSavingVip] = useState(false);
  const [removingVipId, setRemovingVipId] = useState<number | null>(null);

  useEffect(() => {
    setVipLoading(true);
    fetch(`${BASE}/api/admin/vip-customers`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setVipCustomers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setVipLoading(false));
  }, []);

  async function addVipCustomer() {
    const name = newVipName.trim();
    if (!name) return;
    setSavingVip(true);
    try {
      const res = await fetch(`${BASE}/api/admin/vip-customers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 409) { toast({ title: "Already a VIP customer", variant: "destructive" }); return; }
      if (!res.ok) { toast({ title: "Failed to add VIP customer", variant: "destructive" }); return; }
      const customer = await res.json();
      setVipCustomers((prev) => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)));
      setNewVipName("");
      toast({ title: `${customer.name} is now a VIP customer` });
    } finally {
      setSavingVip(false);
    }
  }

  async function removeVipCustomer(id: number, name: string) {
    setRemovingVipId(id);
    try {
      const res = await fetch(`${BASE}/api/admin/vip-customers/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { toast({ title: "Failed to remove", variant: "destructive" }); return; }
      setVipCustomers((prev) => prev.filter((c) => c.id !== id));
      toast({ title: `${name} removed from VIP list` });
    } finally {
      setRemovingVipId(null);
    }
  }

  function startAdd() {
    setAdding({ name: "", role: "waitress", pin: "", bonusPercent: "0" });
    setEditing(null);
  }

  function handleAdd() {
    if (!adding) return;
    if (!adding.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (adding.pin.length !== 4) { toast({ title: "PIN must be 4 digits", variant: "destructive" }); return; }
    createStaff.mutate(
      { data: { name: adding.name.trim(), role: adding.role, pin: adding.pin, bonusPercent: parseInt(adding.bonusPercent) || 0 } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetAdminStaffQueryKey() });
          toast({ title: `${adding.name} added` });
          setAdding(null);
        },
        onError: () => toast({ title: "Failed to add staff member", variant: "destructive" }),
      }
    );
  }

  function startEdit(member: { id: number; name: string; role: string; bonusPercent: number }) {
    setEditing({ id: member.id, name: member.name, role: member.role as Role, pin: "", bonusPercent: String(member.bonusPercent) });
    setAdding(null);
  }

  function handleSave() {
    if (!editing) return;
    const payload: { name?: string; role?: string; pin?: string; bonusPercent?: number } = {
      name: editing.name,
      role: editing.role,
      bonusPercent: parseInt(editing.bonusPercent) || 0,
    };
    if (editing.pin.length === 4) payload.pin = editing.pin;
    updateStaff.mutate(
      { id: editing.id, data: payload },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetAdminStaffQueryKey() });
          toast({ title: "Staff member updated" });
          setEditing(null);
        },
        onError: () => toast({ title: "Failed to update staff member", variant: "destructive" }),
      }
    );
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`${BASE}/api/admin/staff/${id}`, { method: "DELETE", credentials: "include" });
      if (res.status === 204) {
        qc.invalidateQueries({ queryKey: getGetAdminStaffQueryKey() });
        toast({ title: "Staff member removed" });
        setConfirmDelete(null);
      } else {
        const body = await res.json().catch(() => ({}));
        toast({ title: body.error ?? "Failed to delete staff member", variant: "destructive" });
        setConfirmDelete(null);
      }
    } catch {
      toast({ title: "Failed to delete staff member", variant: "destructive" });
      setConfirmDelete(null);
    }
  }

  function toggleVipSection(member: { id: number; isVipSection: boolean }) {
    updateStaff.mutate(
      { id: member.id, data: { isVipSection: !member.isVipSection } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getGetAdminStaffQueryKey() }),
        onError: () => toast({ title: "Failed to update VIP section", variant: "destructive" }),
      }
    );
  }

  function getBonusValue(id: number, currentBonus: number): string {
    return id in bonusEdits ? bonusEdits[id] : String(currentBonus);
  }

  const changedBonuses = useMemo(() => {
    if (!staff) return [];
    return staff.filter((m) => {
      if (!(m.id in bonusEdits)) return false;
      return (parseInt(bonusEdits[m.id]) || 0) !== m.bonusPercent;
    });
  }, [staff, bonusEdits]);

  async function saveAllBonuses() {
    if (changedBonuses.length === 0) return;
    setSavingBonus(true);
    try {
      await Promise.all(
        changedBonuses.map((m) =>
          updateStaff.mutateAsync({ id: m.id, data: { bonusPercent: parseInt(bonusEdits[m.id]) || 0 } })
        )
      );
      await qc.invalidateQueries({ queryKey: getGetAdminStaffQueryKey() });
      setBonusEdits({});
      toast({ title: `Bonus rates updated for ${changedBonuses.length} staff member${changedBonuses.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Some updates failed — please try again", variant: "destructive" });
    } finally {
      setSavingBonus(false);
    }
  }

  // ── Permissions helpers ──────────────────────────────────────────────────────

  async function loadStaffPerms(staffId: number) {
    if (staffPermsMap[staffId] !== undefined) return;
    setLoadingPermsFor((prev) => new Set([...prev, staffId]));
    try {
      const res = await fetch(`${BASE}/api/admin/staff/${staffId}/permissions`, { credentials: "include" });
      const data: { permissions: string[] } = await res.json();
      setStaffPermsMap((prev) => ({ ...prev, [staffId]: data.permissions }));
    } finally {
      setLoadingPermsFor((prev) => { const s = new Set(prev); s.delete(staffId); return s; });
    }
  }

  async function togglePerm(staffId: number, permission: string) {
    const key = `${staffId}:${permission}`;
    setTogglingKey(key);
    const current = staffPermsMap[staffId] ?? [];
    const has = current.includes(permission);
    try {
      if (has) {
        await fetch(`${BASE}/api/admin/staff/${staffId}/permissions/${permission}`, { method: "DELETE", credentials: "include" });
        setStaffPermsMap((prev) => ({ ...prev, [staffId]: (prev[staffId] ?? []).filter((p) => p !== permission) }));
      } else {
        await fetch(`${BASE}/api/admin/staff/${staffId}/permissions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permission }),
        });
        setStaffPermsMap((prev) => ({ ...prev, [staffId]: [...(prev[staffId] ?? []), permission] }));
      }
    } catch {
      toast({ title: "Failed to update permission", variant: "destructive" });
    } finally {
      setTogglingKey(null);
    }
  }

  function handleExpandPerm(staffId: number) {
    if (expandedPermStaff === staffId) {
      setExpandedPermStaff(null);
    } else {
      setExpandedPermStaff(staffId);
      loadStaffPerms(staffId);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <Link href="/">
          <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">Staff Manager</h1>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        {tab === "staff" ? (
          <Button size="sm" onClick={startAdd} className="gap-1 text-xs font-bold uppercase tracking-wide h-9">
            <Plus className="w-4 h-4" />
            Add
          </Button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-border bg-card flex">
        <button
          onClick={() => { setTab("staff"); setAdding(null); setEditing(null); }}
          className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors ${
            tab === "staff" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Accounts
        </button>
        <button
          onClick={() => { setTab("bonus"); setAdding(null); setEditing(null); }}
          className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 ${
            tab === "bonus" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Percent className="w-3 h-3" />
          Bonus
        </button>
        <button
          onClick={() => { setTab("permissions"); setAdding(null); setEditing(null); }}
          className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 ${
            tab === "permissions" ? "text-violet-400 border-b-2 border-violet-400" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck className="w-3 h-3" />
          Perms
        </button>
      </div>

      {/* ── ACCOUNTS TAB ── */}
      {tab === "staff" && (
        <main className="flex-1 overflow-y-auto p-4 space-y-2 pb-8">
          {adding && (
            <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3 mb-4">
              <p className="text-xs font-black uppercase tracking-widest text-primary">New Staff Member</p>
              <Input
                placeholder="Full name"
                value={adding.name}
                onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                className="bg-background border-border focus-visible:ring-primary"
                autoFocus
              />
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={adding.role}
                  onChange={(e) => setAdding({ ...adding, role: e.target.value as Role })}
                  className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Default PIN</span>
                  <PinInput value={adding.pin} onChange={(v) => setAdding({ ...adding, pin: v })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">Bonus %</span>
                <input
                  type="number" min="0" max="100" value={adding.bonusPercent}
                  onChange={(e) => setAdding({ ...adding, bonusPercent: e.target.value })}
                  className="w-20 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center font-mono"
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground">% of sales</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAdd} disabled={createStaff.isPending} className="flex-1 gap-2 font-bold uppercase tracking-wide">
                  <Check className="w-4 h-4" />
                  Create Account
                </Button>
                <Button variant="outline" onClick={() => setAdding(null)} className="gap-2">
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-16 w-full bg-card rounded-xl" />)}
            </div>
          ) : !staff?.length ? (
            <p className="text-center text-muted-foreground text-sm uppercase tracking-widest pt-16 opacity-50">No staff members yet</p>
          ) : (
            staff.map((member) => {
              const isEditing = editing?.id === member.id;
              const isDeleting = confirmDelete === member.id;

              if (isEditing && editing) {
                return (
                  <div key={member.id} className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-black uppercase tracking-widest text-primary">Editing: {member.name}</p>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="bg-background border-border focus-visible:ring-primary"
                    />
                    <div className="flex gap-2 items-center flex-wrap">
                      <select
                        value={editing.role}
                        onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
                        className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Reset PIN</span>
                        <PinInput value={editing.pin} onChange={(v) => setEditing({ ...editing, pin: v })} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">Bonus %</span>
                      <input
                        type="number" min="0" max="100" value={editing.bonusPercent}
                        onChange={(e) => setEditing({ ...editing, bonusPercent: e.target.value })}
                        className="w-20 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center font-mono"
                        placeholder="0"
                      />
                      <span className="text-xs text-muted-foreground">% of sales</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Leave PIN blank to keep current PIN</p>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={updateStaff.isPending} className="flex-1 gap-2 font-bold uppercase tracking-wide">
                        <Check className="w-4 h-4" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditing(null)} className="gap-2">
                        <X className="w-4 h-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={member.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{member.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${ROLE_COLOR[member.role as Role] ?? "bg-muted text-muted-foreground"}`}>
                        {ROLE_LABEL[member.role as Role] ?? member.role}
                      </span>
                      {member.bonusPercent > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          {member.bonusPercent}% bonus
                        </span>
                      )}
                      {member.isVipSection && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">
                          <Crown className="w-3 h-3" />
                          VIP
                        </span>
                      )}
                    </div>
                  </div>

                  {isDeleting ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-destructive font-bold mr-1">Remove?</span>
                      <button onClick={() => handleDelete(member.id)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-destructive text-white hover:opacity-80">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleVipSection(member)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                          member.isVipSection
                            ? "bg-purple-500/20 border-purple-500/40 text-purple-400"
                            : "border-border text-muted-foreground hover:text-purple-400 hover:border-purple-400/50"
                        }`}
                        title={member.isVipSection ? "VIP Section — click to remove" : "Assign to VIP Section"}
                      >
                        <Crown className="w-4 h-4" />
                      </button>
                      <button onClick={() => startEdit(member)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors" title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {member.role !== "admin" && (
                        <button onClick={() => setConfirmDelete(member.id)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </main>
      )}

      {/* ── BONUS RATES TAB ── */}
      {tab === "bonus" && (
        <main className="flex-1 overflow-y-auto pb-28">
          <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20">
            <p className="text-xs text-emerald-400/80 font-semibold">
              Set the bonus percentage each staff member earns on their total sales. Changes are saved when you tap <strong>Save All</strong>.
            </p>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-14 w-full bg-card rounded-xl" />)}
            </div>
          ) : !staff?.length ? (
            <p className="text-center text-muted-foreground text-sm uppercase tracking-widest pt-16 opacity-50">No staff members yet</p>
          ) : (
            <>
              <div className="flex items-center px-4 py-2 border-b border-border bg-card/50">
                <span className="flex-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</span>
                <span className="w-28 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Role</span>
                <span className="w-32 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Bonus %</span>
              </div>
              <div className="divide-y divide-border/50">
                {staff.map((member) => {
                  const current = getBonusValue(member.id, member.bonusPercent);
                  const changed = (parseInt(current) || 0) !== member.bonusPercent;
                  return (
                    <div key={member.id} className={`flex items-center px-4 py-3 transition-colors ${changed ? "bg-emerald-500/5" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{member.name}</p>
                      </div>
                      <div className="w-28 flex justify-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${ROLE_COLOR[member.role as Role] ?? "bg-muted text-muted-foreground"}`}>
                          {ROLE_LABEL[member.role as Role] ?? member.role}
                        </span>
                      </div>
                      <div className="w-32 flex items-center justify-center gap-1">
                        <div className="relative">
                          <input
                            type="number" min="0" max="100" value={current}
                            onChange={(e) => setBonusEdits((prev) => ({ ...prev, [member.id]: e.target.value }))}
                            className={`w-20 h-10 rounded-lg border text-sm font-black text-center font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50 bg-background transition-colors ${
                              changed ? "border-emerald-500/60 text-emerald-400" : "border-border text-foreground"
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground pointer-events-none">%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className={`fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 transition-all ${changedBonuses.length > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <Button
              className="w-full gap-2 font-black uppercase tracking-widest bg-emerald-700 hover:bg-emerald-600 text-white"
              onClick={saveAllBonuses}
              disabled={savingBonus || changedBonuses.length === 0}
            >
              <Check className="w-5 h-5" />
              {savingBonus ? "Saving…" : `Save ${changedBonuses.length} Change${changedBonuses.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </main>
      )}

      {/* ── PERMISSIONS TAB ── */}
      {tab === "permissions" && (
        <main className="flex-1 overflow-y-auto p-4 space-y-2 pb-8">
          <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Grant specific abilities to staff regardless of their base role. <span className="text-violet-400 font-semibold">Admins always have full access</span> and cannot be restricted.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => <Skeleton key={n} className="h-14 w-full bg-card rounded-xl" />)}
            </div>
          ) : !staff?.filter((m) => m.role !== "admin").length ? (
            <p className="text-center text-muted-foreground text-sm uppercase tracking-widest pt-16 opacity-50">No non-admin staff</p>
          ) : (
            staff.filter((m) => m.role !== "admin").map((member) => {
              const isExpanded = expandedPermStaff === member.id;
              const memberPerms = staffPermsMap[member.id] ?? [];
              const isLoadingPerms = loadingPermsFor.has(member.id);

              return (
                <div key={member.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => handleExpandPerm(member.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{member.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${ROLE_COLOR[member.role as Role] ?? "bg-muted text-muted-foreground"}`}>
                          {ROLE_LABEL[member.role as Role] ?? member.role}
                        </span>
                        {!isExpanded && staffPermsMap[member.id] !== undefined && memberPerms.length > 0 && (
                          <span className="text-xs text-violet-400 font-semibold">
                            {memberPerms.length} permission{memberPerms.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {!isExpanded && staffPermsMap[member.id] !== undefined && memberPerms.length === 0 && (
                          <span className="text-xs text-muted-foreground/60">no extra permissions</span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/5">
                      {isLoadingPerms ? (
                        <div className="space-y-2">
                          {[1, 2].map((n) => <Skeleton key={n} className="h-8 w-full rounded-lg" />)}
                        </div>
                      ) : (
                        PERM_GROUPS.map(([group, perms]) => (
                          <div key={group}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{group}</p>
                            <div className="flex flex-wrap gap-2">
                              {perms.map((p) => {
                                const active = memberPerms.includes(p.key);
                                const toggling = togglingKey === `${member.id}:${p.key}`;
                                return (
                                  <button
                                    key={p.key}
                                    onClick={() => togglePerm(member.id, p.key)}
                                    disabled={toggling}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                                      active
                                        ? "bg-violet-500/15 text-violet-300 border-violet-500/40 hover:bg-violet-500/25"
                                        : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground"
                                    }`}
                                  >
                                    {active && !toggling && <span className="mr-1">✓</span>}
                                    {toggling ? "…" : p.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {/* ── VIP Customers ─────────────────────────────────────────── */}
          <section className="px-4 pt-6 pb-8">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-4 h-4 text-yellow-400" />
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">VIP Customers</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Customers on this list automatically get VIP prices on every order, regardless of which staff takes the order.
            </p>

            {/* Add form */}
            <div className="flex gap-2 mb-4">
              <Input
                value={newVipName}
                onChange={(e) => setNewVipName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addVipCustomer(); }}
                placeholder="Customer name…"
                className="h-10 bg-background border-border text-sm"
              />
              <Button
                onClick={addVipCustomer}
                disabled={savingVip || !newVipName.trim()}
                size="sm"
                className="h-10 px-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold shrink-0"
              >
                {savingVip ? "…" : <><Plus className="w-4 h-4 mr-1" />Add VIP</>}
              </Button>
            </div>

            {/* List */}
            {vipLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((n) => <Skeleton key={n} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : vipCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic py-2">No VIP customers yet.</p>
            ) : (
              <div className="space-y-2">
                {vipCustomers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      <span className="text-sm font-semibold">{c.name}</span>
                    </div>
                    <button
                      onClick={() => removeVipCustomer(c.id, c.name)}
                      disabled={removingVipId === c.id}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                    >
                      {removingVipId === c.id ? <span className="text-xs">…</span> : <X className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

export default function AdminStaff() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  if (authLoading) return null;
  if (!isAdmin) return <Redirect to="/" />;
  return <AdminStaffInner />;
}
