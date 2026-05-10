import { useState, useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Layers, Tag } from "lucide-react";
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
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

type AddState = { name: string; category: string; pricePence: string } | null;
type BulkRow = { name: string; category: string; pricePence: string };

export default function Admin() {
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

  // Bulk edit state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEdits, setBulkEdits] = useState<Record<number, BulkRow>>({});
  const [savingBulk, setSavingBulk] = useState(false);

  // Live category names: from DB + any on existing products not yet in DB
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

  // Enter bulk mode: seed edits from current data
  function enterBulkMode() {
    if (!menuItems) return;
    const seed: Record<number, BulkRow> = {};
    for (const item of menuItems) {
      seed[item.id] = {
        name: item.name,
        category: item.category,
        pricePence: (item.pricePence / 100).toFixed(2),
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
      return row.name.trim() !== item.name || row.category !== item.category || price !== item.pricePence;
    });

    if (changed.length === 0) {
      toast({ title: "No changes to save" });
      setSavingBulk(false);
      exitBulkMode();
      return;
    }

    const invalid = changed.find((item) => {
      const row = bulkEdits[item.id];
      return !row.name.trim() || isNaN(parseFloat(row.pricePence)) || parseFloat(row.pricePence) < 0;
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
          return updateItem.mutateAsync({
            id: item.id,
            data: {
              name: row.name.trim(),
              category: row.category,
              pricePence: Math.round(parseFloat(row.pricePence) * 100),
            },
          });
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
    setAdding({ name: "", category: categories[0] ?? "", pricePence: "" });
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
      { data: { name: adding.name.trim(), category: adding.category, pricePence: Math.round(price * 100) } },
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
      return row.name.trim() !== item.name || row.category !== item.category || price !== item.pricePence;
    }).length;
  }, [menuItems, bulkEdits, bulkMode]);

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
            <Link href="/admin/categories">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs font-bold uppercase tracking-wide h-9"
                title="Manage Categories"
              >
                <Tag className="w-4 h-4" />
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={enterBulkMode}
              className="gap-1 text-xs font-bold uppercase tracking-wide h-9"
              title="Bulk Edit"
            >
              <Layers className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={startAdd} className="gap-1 text-xs font-bold uppercase tracking-wide h-9">
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        )}
      </header>

      {/* Category filter tabs — hidden in bulk mode (show all) */}
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

      {/* Bulk mode banner */}
      {bulkMode && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between">
          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
            Editing all {menuItems?.length ?? 0} products — tap Save All when done
          </p>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 space-y-2 pb-8">
        {/* Add new product form */}
        {adding && !bulkMode && (
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
          /* ── BULK EDIT MODE: show all items as editable rows grouped by category ── */
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
                        row.name.trim() !== original.name ||
                        row.category !== original.category ||
                        Math.round(priceNum * 100) !== original.pricePence;

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border px-3 py-2 flex items-center gap-2 transition-colors ${
                            changed ? "border-amber-500/60 bg-amber-500/5" : "border-border bg-card"
                          }`}
                        >
                          {/* Name */}
                          <Input
                            value={row.name}
                            onChange={(e) => updateBulkRow(item.id, "name", e.target.value)}
                            className="flex-1 h-8 text-sm bg-background border-border focus-visible:ring-primary min-w-0"
                            placeholder="Name"
                          />
                          {/* Category */}
                          <select
                            value={row.category}
                            onChange={(e) => updateBulkRow(item.id, "category", e.target.value)}
                            className="h-8 w-28 shrink-0 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          {/* Price */}
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
                          {/* Delete */}
                          {confirmDelete === item.id ? (
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {/* Save All sticky footer */}
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
          /* ── NORMAL VIEW ── */
          <>
            {filtered.map((item) => {
              const isDeleting = confirmDelete === item.id;
              return (
                <div key={item.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.category}</p>
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
                        onClick={() => { enterBulkMode(); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(item.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
