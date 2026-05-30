import { useState, useMemo, useEffect } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Layers, Tag, Barcode, Hash, Phone } from "lucide-react";
import {
  useGetMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  getGetMenuItemsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
type DbCategory = { id: number; name: string };
async function fetchCategories(): Promise<DbCategory[]> {
  const res = await fetch(`${BASE}/api/categories`);
  if (!res.ok) return [];
  return res.json();
}
const CATS_KEY = ["categories"];

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

type AddState = { name: string; category: string; pricePence: string; barcode: string; sku: string } | null;
type BulkRow = { name: string; category: string; pricePence: string; barcode: string; sku: string };

function AdminInner({ canManage, canPrice, canDelete, isAdmin }: { canManage: boolean; canPrice: boolean; canDelete: boolean; isAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: menuItems, isLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  const { data: dbCategories } = useQuery<DbCategory[]>({
    queryKey: CATS_KEY,
    queryFn: fetchCategories,
  });

  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();

  const [adding, setAdding] = useState<AddState>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEdits, setBulkEdits] = useState<Record<number, BulkRow>>({});
  const [savingBulk, setSavingBulk] = useState(false);

  const [editScanId, setEditScanId] = useState<number | null>(null);
  const [editScanValues, setEditScanValues] = useState<{ barcode: string; sku: string }>({ barcode: "", sku: "" });

  // ── Order phone setting ──────────────────────────────────────────────
  const [orderPhoneValue, setOrderPhoneValue] = useState("");
  const [orderPhoneSaved, setOrderPhoneSaved] = useState("");
  const [orderPhoneSaving, setOrderPhoneSaving] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/public/settings/order-phone`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.phone) { setOrderPhoneValue(d.phone); setOrderPhoneSaved(d.phone); } })
      .catch(() => {});
  }, []);

  async function saveOrderPhone() {
    if (!orderPhoneValue.trim()) return;
    setOrderPhoneSaving(true);
    try {
      const res = await fetch(`${BASE}/api/settings/order-phone`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: orderPhoneValue.trim() }),
      });
      if (!res.ok) throw new Error();
      setOrderPhoneSaved(orderPhoneValue.trim());
      toast({ title: "Phone number saved" });
    } catch {
      toast({ title: "Failed to save phone number", variant: "destructive" });
    } finally {
      setOrderPhoneSaving(false);
    }
  }

  const categories = useMemo(() => {
    const dbNames = (dbCategories ?? []).map((c) => c.name);
    const itemCats = menuItems ? Array.from(new Set(menuItems.map((i) => i.category))) : [];
    return Array.from(new Set([...dbNames, ...itemCats])).sort();
  }, [dbCategories, menuItems]);

  const allCategories = ["All", ...categories];

  const filtered = useMemo(() => {
    if (!menuItems) return [];
    if (activeCategory === "All")
      return [...menuItems].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return menuItems.filter((i) => i.category === activeCategory).sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems, activeCategory]);

  function enterBulkMode() {
    if (!menuItems) return;
    const seed: Record<number, BulkRow> = {};
    for (const item of menuItems) {
      seed[item.id] = {
        name: item.name,
        category: item.category,
        pricePence: (item.pricePence / 100).toFixed(2),
        barcode: item.barcode ?? "",
        sku: item.sku ?? "",
      };
    }
    setBulkEdits(seed);
    setBulkMode(true);
    setAdding(null);
  }

  function exitBulkMode() {
    setBulkMode(false);
    setBulkEdits({});
  }

  async function saveEditScan() {
    if (editScanId === null) return;
    try {
      await updateItem.mutateAsync({
        params: { id: editScanId },
        data: {
          barcode: editScanValues.barcode.trim() || null,
          sku: editScanValues.sku.trim() || null,
        },
      });
      await qc.invalidateQueries({ queryKey: getGetMenuItemsQueryKey() });
      setEditScanId(null);
      toast({ title: "Code / barcode saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }

  function updateBulkRow(id: number, field: keyof BulkRow, value: string) {
    setBulkEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  async function saveBulk() {
    if (!menuItems) return;
    setSavingBulk(true);
    const changed = menuItems.filter((item) => {
      const row = bulkEdits[item.id];
      if (!row) return false;
      const price = Math.round(parseFloat(row.pricePence) * 100);
      const nameChanged = canManage && row.name.trim() !== item.name;
      const catChanged = canManage && row.category !== item.category;
      const priceChanged = canPrice && price !== item.pricePence;
      const barcodeChanged = canManage && (row.barcode.trim() || null) !== (item.barcode ?? null);
      const skuChanged = canManage && (row.sku.trim() || null) !== (item.sku ?? null);
      return nameChanged || catChanged || priceChanged || barcodeChanged || skuChanged;
    });

    if (changed.length === 0) {
      toast({ title: "No changes to save" });
      setSavingBulk(false);
      exitBulkMode();
      return;
    }

    const invalid = changed.find((item) => {
      const row = bulkEdits[item.id];
      return (canManage && !row.name.trim()) || (canPrice && (isNaN(parseFloat(row.pricePence)) || parseFloat(row.pricePence) < 0));
    });
    if (invalid) {
      toast({ title: "Some rows have invalid data — check names and prices", variant: "destructive" });
      setSavingBulk(false);
      return;
    }

    try {
      await Promise.all(
        changed.map((item) => {
          const row = bulkEdits[item.id];
          const data: Record<string, unknown> = {};
          if (canManage) { data.name = row.name.trim(); data.category = row.category; data.barcode = row.barcode.trim() || null; data.sku = row.sku.trim() || null; }
          if (canPrice) { data.pricePence = Math.round(parseFloat(row.pricePence) * 100); }
          return updateItem.mutateAsync({ id: item.id, data: data as Parameters<typeof updateItem.mutateAsync>[0]["data"] });
        })
      );
      await qc.invalidateQueries({ queryKey: getGetMenuItemsQueryKey() });
      toast({ title: `${changed.length} product${changed.length !== 1 ? "s" : ""} updated` });
      exitBulkMode();
    } catch {
      toast({ title: "Some updates failed — please try again", variant: "destructive" });
    } finally {
      setSavingBulk(false);
    }
  }

  function startAdd() {
    setAdding({ name: "", category: categories[0] ?? "", pricePence: "", barcode: "", sku: "" });
    setBulkMode(false);
  }

  function handleAdd() {
    if (!adding) return;
    const price = parseFloat(adding.pricePence);
    if (!adding.name.trim() || isNaN(price) || price < 0) {
      toast({ title: "Please fill in all fields correctly", variant: "destructive" });
      return;
    }
    createItem.mutate(
      { data: { name: adding.name.trim(), category: adding.category, pricePence: Math.round(price * 100), barcode: adding.barcode.trim() || null, sku: adding.sku.trim() || null } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMenuItemsQueryKey() });
          toast({ title: "Product added" });
          setAdding(null);
        },
        onError: () => toast({ title: "Failed to add product", variant: "destructive" }),
      }
    );
  }

  function handleDelete(id: number) {
    deleteItem.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMenuItemsQueryKey() });
          toast({ title: "Product deleted" });
          setConfirmDelete(null);
          if (bulkEdits[id]) {
            const next = { ...bulkEdits };
            delete next[id];
            setBulkEdits(next);
          }
        },
        onError: () => toast({ title: "Failed to delete product", variant: "destructive" }),
      }
    );
  }

  const changedCount = useMemo(() => {
    if (!menuItems || !bulkMode) return 0;
    return menuItems.filter((item) => {
      const row = bulkEdits[item.id];
      if (!row) return false;
      const price = Math.round(parseFloat(row.pricePence) * 100);
      const nameChanged = canManage && row.name.trim() !== item.name;
      const catChanged = canManage && row.category !== item.category;
      const priceChanged = canPrice && price !== item.pricePence;
      const barcodeChanged = canManage && (row.barcode.trim() || null) !== (item.barcode ?? null);
      const skuChanged = canManage && (row.sku.trim() || null) !== (item.sku ?? null);
      return nameChanged || catChanged || priceChanged || barcodeChanged || skuChanged;
    }).length;
  }, [menuItems, bulkEdits, bulkMode, canManage, canPrice]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <Link href="/">
          <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">Product Manager</h1>
          <p className="text-xs text-muted-foreground">
            {bulkMode ? `Bulk Edit${changedCount > 0 ? ` — ${changedCount} changed` : ""}` : "Admin"}
          </p>
        </div>
        {bulkMode ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={saveBulk}
              disabled={savingBulk}
              className="gap-1 text-xs font-bold uppercase tracking-wide h-9 bg-green-700 hover:bg-green-600"
            >
              <Check className="w-4 h-4" />
              {savingBulk ? "Saving…" : "Save All"}
            </Button>
            <Button size="sm" variant="outline" onClick={exitBulkMode} className="h-9 w-9 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            {canManage && (
              <Link href="/admin/categories">
                <Button size="sm" variant="outline" className="gap-1 text-xs font-bold uppercase tracking-wide h-9" title="Manage Categories">
                  <Tag className="w-4 h-4" />
                </Button>
              </Link>
            )}
            {(canManage || canPrice) && (
              <Button
                size="sm"
                variant="outline"
                onClick={enterBulkMode}
                className="gap-1 text-xs font-bold uppercase tracking-wide h-9"
                title="Bulk Edit"
              >
                <Layers className="w-4 h-4" />
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={startAdd} className="gap-1 text-xs font-bold uppercase tracking-wide h-9">
                <Plus className="w-4 h-4" />
                Add
              </Button>
            )}
          </div>
        )}
      </header>

      {/* Order Phone Setting — admin only */}
      {!bulkMode && isAdmin && (
        <div className="shrink-0 border-b border-border bg-card px-4 py-3 flex items-center gap-3">
          <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground shrink-0">Order Line</span>
          <input
            type="tel"
            placeholder="Phone number for customer orders"
            value={orderPhoneValue}
            onChange={(e) => setOrderPhoneValue(e.target.value)}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60 min-w-0"
          />
          <button
            onClick={saveOrderPhone}
            disabled={orderPhoneSaving || !orderPhoneValue.trim() || orderPhoneValue.trim() === orderPhoneSaved}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-wide disabled:opacity-50 transition-opacity"
          >
            <Check className="w-3.5 h-3.5" />
            {orderPhoneSaving ? "Saving…" : "Save"}
          </button>
        </div>
      )}

      {/* Category filter tabs */}
      {!bulkMode && (
        <div className="shrink-0 overflow-x-auto border-b border-border bg-card">
          <div className="flex gap-1 px-4 py-2 min-w-max">
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {bulkMode && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
            Editing all {menuItems?.length ?? 0} products — tap Save All when done
          </p>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 space-y-2 pb-8">
        {/* Add new product form */}
        {adding && !bulkMode && canManage && (
          <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3 mb-4">
            <p className="text-xs font-black uppercase tracking-widest text-primary">New Product</p>
            <Input
              placeholder="Product name"
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              className="bg-background border-border focus-visible:ring-primary"
              autoFocus
            />
            <div className="flex gap-2">
              <select
                value={adding.category}
                onChange={(e) => setAdding({ ...adding, category: e.target.value })}
                className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="relative w-32">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">₵</span>
                <Input
                  type="number"
                  min="0"
                  step="0.50"
                  placeholder="0.00"
                  value={adding.pricePence}
                  onChange={(e) => setAdding({ ...adding, pricePence: e.target.value })}
                  className="pl-7 bg-background border-border focus-visible:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="4-digit code (e.g. 0042)"
                  value={adding.sku}
                  onChange={(e) => setAdding({ ...adding, sku: e.target.value })}
                  className="pl-8 bg-background border-border focus-visible:ring-primary font-mono text-sm"
                  maxLength={10}
                />
              </div>
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Barcode (optional)"
                  value={adding.barcode}
                  onChange={(e) => setAdding({ ...adding, barcode: e.target.value })}
                  className="pl-8 bg-background border-border focus-visible:ring-primary font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={createItem.isPending} className="flex-1 gap-2 font-bold uppercase tracking-wide">
                <Check className="w-4 h-4" />
                Save Product
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
            {[1, 2, 3, 4, 5].map((n) => <Skeleton key={n} className="h-16 w-full bg-card rounded-xl" />)}
          </div>
        ) : bulkMode ? (
          <>
            {categories.map((cat) => {
              const catItems = (menuItems ?? [])
                .filter((i) => i.category === cat)
                .sort((a, b) => a.name.localeCompare(b.name));
              if (catItems.length === 0) return null;
              return (
                <div key={cat}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 pb-1 pt-3">
                    {cat}
                  </p>
                  <div className="space-y-2">
                    {catItems.map((item) => {
                      const row = bulkEdits[item.id];
                      if (!row) return null;
                      const original = item;
                      const priceNum = parseFloat(row.pricePence);
                      const changed =
                        (canManage && (row.name.trim() !== original.name || row.category !== original.category)) ||
                        (canPrice && Math.round(priceNum * 100) !== original.pricePence);

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border px-3 py-2 flex items-center gap-2 transition-colors ${
                            changed ? "border-amber-500/60 bg-amber-500/5" : "border-border bg-card"
                          }`}
                        >
                          {/* Name */}
                          {canManage ? (
                            <Input
                              value={row.name}
                              onChange={(e) => updateBulkRow(item.id, "name", e.target.value)}
                              className="flex-1 h-8 text-sm bg-background border-border focus-visible:ring-primary min-w-0"
                              placeholder="Name"
                            />
                          ) : (
                            <span className="flex-1 text-sm font-medium truncate min-w-0">{row.name}</span>
                          )}
                          {/* Category */}
                          {canManage ? (
                            <select
                              value={row.category}
                              onChange={(e) => updateBulkRow(item.id, "category", e.target.value)}
                              className="h-8 w-28 shrink-0 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground w-28 shrink-0 text-center">{row.category}</span>
                          )}
                          {/* Price */}
                          {canPrice ? (
                            <div className="relative w-24 shrink-0">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">₵</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.50"
                                value={row.pricePence}
                                onChange={(e) => updateBulkRow(item.id, "pricePence", e.target.value)}
                                className="pl-5 h-8 text-sm bg-background border-border focus-visible:ring-primary"
                              />
                            </div>
                          ) : (
                            <span className="w-24 shrink-0 text-center text-sm font-bold text-primary">{formatPrice(item.pricePence)}</span>
                          )}
                          {/* Delete */}
                          {canDelete && (
                            confirmDelete === item.id ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="w-7 h-7 flex items-center justify-center rounded bg-destructive text-white hover:opacity-80"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(item.id)}
                                className="w-7 h-7 shrink-0 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {changedCount > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 flex gap-3">
                <Button
                  className="flex-1 gap-2 font-black uppercase tracking-widest bg-green-700 hover:bg-green-600"
                  onClick={saveBulk}
                  disabled={savingBulk}
                >
                  <Check className="w-5 h-5" />
                  {savingBulk ? "Saving…" : `Save ${changedCount} Change${changedCount !== 1 ? "s" : ""}`}
                </Button>
                <Button variant="outline" onClick={exitBulkMode} className="gap-2 font-bold uppercase tracking-wide">
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            )}
          </>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm uppercase tracking-widest pt-16 opacity-50">
            No products in this category
          </p>
        ) : (
          <>
            {filtered.map((item) => {
              const isDeleting = confirmDelete === item.id;
              return (
                <div key={item.id} className={`bg-card border border-border rounded-xl transition-all ${editScanId === item.id ? "px-4 py-3 space-y-2" : "px-4 py-3 flex items-center gap-3"}`}>
                  {editScanId === item.id ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.category} · {formatPrice(item.pricePence)}</p>
                        </div>
                        <button
                          onClick={() => setEditScanId(null)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                          <Input
                            placeholder="4-digit code (e.g. 0042)"
                            value={editScanValues.sku}
                            onChange={(e) => setEditScanValues((v) => ({ ...v, sku: e.target.value }))}
                            className="pl-7 bg-background border-border focus-visible:ring-primary font-mono text-sm h-9"
                            maxLength={10}
                          />
                        </div>
                        <div className="relative flex-1">
                          <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                          <Input
                            placeholder="Barcode (optional)"
                            value={editScanValues.barcode}
                            onChange={(e) => setEditScanValues((v) => ({ ...v, barcode: e.target.value }))}
                            className="pl-7 bg-background border-border focus-visible:ring-primary font-mono text-sm h-9"
                          />
                        </div>
                      </div>
                      <Button
                        onClick={saveEditScan}
                        disabled={updateItem.isPending}
                        size="sm"
                        className="w-full gap-2 font-bold uppercase tracking-wide"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.category}</p>
                          {item.sku && <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded">{item.sku}</span>}
                          {item.barcode && <Barcode className="w-3 h-3 text-muted-foreground/40" />}
                        </div>
                      </div>
                      <span className="text-primary font-black text-base shrink-0">{formatPrice(item.pricePence)}</span>

                      {isDeleting ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-destructive font-bold mr-1">Delete?</span>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-destructive text-white hover:opacity-80"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditScanId(item.id); setEditScanValues({ sku: item.sku ?? "", barcode: item.barcode ?? "" }); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                            title="Set code / barcode"
                          >
                            <Hash className="w-4 h-4" />
                          </button>
                          {(canManage || canPrice) && (
                            <button
                              onClick={() => enterBulkMode()}
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                              title="Edit all fields"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setConfirmDelete(item.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}

export default function Admin() {
  const { isAdmin, hasPermission, isLoading: authLoading } = useAuth();

  if (authLoading) return null;

  const canManage = isAdmin || hasPermission("manage_products");
  const canPrice = isAdmin || hasPermission("change_prices");
  const canDelete = isAdmin || hasPermission("delete_products");

  if (!canManage && !canPrice) return <Redirect to="/" />;

  return <AdminInner canManage={canManage} canPrice={canPrice} canDelete={canDelete} isAdmin={isAdmin} />;
}
