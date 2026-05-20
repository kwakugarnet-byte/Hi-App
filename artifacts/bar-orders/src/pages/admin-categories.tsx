import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Check, X, Tag } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

type Category = { id: number; name: string; createdAt: string };

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE}/api/categories`);
  if (!res.ok) throw new Error("Failed to load categories");
  return res.json();
}

async function createCategory(name: string): Promise<Category> {
  const res = await fetch(`${BASE}/api/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to create category");
  }
  return res.json();
}

async function deleteCategory(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/categories/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete category");
}

const CATS_KEY = ["categories"];

export default function AdminCategories() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: CATS_KEY,
    queryFn: fetchCategories,
  });

  const addMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: CATS_KEY });
      setNewName("");
      toast({ title: `"${cat.name}" added` });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CATS_KEY });
      setConfirmDelete(null);
      toast({ title: "Category deleted" });
    },
    onError: () => toast({ title: "Failed to delete category", variant: "destructive" }),
  });

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    addMutation.mutate(name);
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/admin">
          <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">Categories</h1>
          <p className="text-xs text-muted-foreground">Manage product categories</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-3 pb-8 max-w-lg mx-auto w-full">
        {/* Add new category */}
        <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">New Category</p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Cocktails"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="flex-1 bg-background border-border focus-visible:ring-primary"
              autoFocus
            />
            <Button
              onClick={handleAdd}
              disabled={!newName.trim() || addMutation.isPending}
              className="gap-1 font-bold uppercase tracking-wide"
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </div>
        </div>

        {/* Category list */}
        {isLoading ? (
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-14 w-full bg-card rounded-xl" />)}
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Tag className="w-10 h-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground uppercase tracking-widest">No categories yet</p>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
              {categories.length} categor{categories.length === 1 ? "y" : "ies"}
            </p>
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Tag className="w-4 h-4 text-primary shrink-0" />
                  <p className="font-bold text-sm truncate">{cat.name}</p>
                </div>

                {confirmDelete === cat.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-destructive font-bold mr-1">Delete?</span>
                    <button
                      onClick={() => deleteMutation.mutate(cat.id)}
                      disabled={deleteMutation.isPending}
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
                  <button
                    onClick={() => setConfirmDelete(cat.id)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info note */}
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 mt-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Categories appear in the product manager and on the customer menu. Deleting a category does not delete its products — they will keep the old category name until you reassign them.
          </p>
        </div>
      </main>
    </div>
  );
}
