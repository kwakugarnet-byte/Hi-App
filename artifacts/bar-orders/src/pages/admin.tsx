import { useState, useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  useGetMenuItems,
  useCreateMenuItem,
  useUpdateMenuItem,
  useDeleteMenuItem,
  getGetMenuItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORIES = ["Beer", "Cider", "Spirits", "Whiskey", "Wine", "Soft Drinks"];

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

type EditState = { id: number; name: string; category: string; pricePence: number } | null;
type AddState = { name: string; category: string; pricePence: string } | null;

export default function Admin() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: menuItems, isLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  const createItem = useCreateMenuItem();
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();

  const [editing, setEditing] = useState<EditState>(null);
  const [adding, setAdding] = useState<AddState>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const categories = useMemo(() => {
    if (!menuItems) return CATEGORIES;
    const cats = Array.from(new Set(menuItems.map((i) => i.category)));
    return cats.sort();
  }, [menuItems]);

  const allCategories = ["All", ...categories];

  const filtered = useMemo(() => {
    if (!menuItems) return [];
    if (activeCategory === "All") return [...menuItems].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return menuItems.filter((i) => i.category === activeCategory).sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems, activeCategory]);

  function startAdd() {
    setAdding({ name: "", category: categories[0] ?? CATEGORIES[0], pricePence: "" });
    setEditing(null);
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

  function startEdit(item: { id: number; name: string; category: string; pricePence: number }) {
    setEditing({ ...item });
    setAdding(null);
  }

  function handleSave() {
    if (!editing) return;
    updateItem.mutate(
      { id: editing.id, data: { name: editing.name, category: editing.category, pricePence: editing.pricePence } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMenuItemsQueryKey() });
          toast({ title: "Product updated" });
          setEditing(null);
        },
        onError: () => toast({ title: "Failed to update product", variant: "destructive" }),
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
          if (editing?.id === id) setEditing(null);
        },
        onError: () => toast({ title: "Failed to delete product", variant: "destructive" }),
      }
    );
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
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">Product Manager</h1>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        <Button size="sm" onClick={startAdd} className="gap-1 text-xs font-bold uppercase tracking-wide h-9">
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </header>

      {/* Category filter tabs */}
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

      <main className="flex-1 overflow-y-auto p-4 space-y-2 pb-8">
        {/* Add new product form */}
        {adding && (
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
                {[...CATEGORIES, ...categories.filter((c) => !CATEGORIES.includes(c))].map((c) => (
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
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm uppercase tracking-widest pt-16 opacity-50">No products in this category</p>
        ) : (
          <>
            {filtered.map((item) => {
              const isEditing = editing?.id === item.id;
              const isDeleting = confirmDelete === item.id;

              if (isEditing && editing) {
                return (
                  <div key={item.id} className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3">
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="bg-background border-border focus-visible:ring-primary"
                    />
                    <div className="flex gap-2">
                      <select
                        value={editing.category}
                        onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                        className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {[...CATEGORIES, ...categories.filter((c) => !CATEGORIES.includes(c))].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <div className="relative w-32">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">₵</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.50"
                          value={(editing.pricePence / 100).toFixed(2)}
                          onChange={(e) => setEditing({ ...editing, pricePence: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                          className="pl-7 bg-background border-border focus-visible:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={updateItem.isPending} className="flex-1 gap-2 font-bold uppercase tracking-wide">
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
                        onClick={() => startEdit(item)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
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
