import { useState, useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Send, Plus, Minus, Trash2 } from "lucide-react";
import {
  useGetMenuItems,
  useCreateOrderBatch,
  getGetMenuItemsQueryKey,
  getGetOrderBatchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type SelectedItem = { menuItemId: number; menuItemName: string; quantity: number };

export default function Waitress() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const waitressName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "Staff";

  const { data: menuItems, isLoading: menuLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  const createOrder = useCreateOrderBatch();

  const [customerName, setCustomerName] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, SelectedItem>>({});
  const [nameError, setNameError] = useState(false);

  const categories = useMemo(() => {
    if (!menuItems) return [];
    const cats = Array.from(new Set(menuItems.map((i) => i.category)));
    return cats;
  }, [menuItems]);

  const currentTab = activeTab ?? categories[0] ?? null;

  const itemsInTab = useMemo(() => {
    if (!menuItems || !currentTab) return [];
    return menuItems.filter((i) => i.category === currentTab);
  }, [menuItems, currentTab]);

  const selectedList = Object.values(selected);
  const totalItems = selectedList.reduce((sum, i) => sum + i.quantity, 0);

  function addItem(id: number, name: string) {
    setSelected((prev) => {
      const existing = prev[id];
      return {
        ...prev,
        [id]: { menuItemId: id, menuItemName: name, quantity: (existing?.quantity ?? 0) + 1 },
      };
    });
  }

  function changeQty(id: number, delta: number) {
    setSelected((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ...existing, quantity: newQty } };
    });
  }

  function handleSend() {
    if (!customerName.trim()) {
      setNameError(true);
      return;
    }
    if (selectedList.length === 0) {
      toast({ title: "No items", description: "Add at least one drink to the order.", variant: "destructive" });
      return;
    }

    createOrder.mutate(
      {
        data: {
          waitressName,
          customerName: customerName.trim(),
          items: selectedList.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Order Sent", description: `Order for ${customerName.trim()} sent to the bar.` });
          queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
          setCustomerName("");
          setSelected({});
          setNameError(false);
        },
        onError: () => {
          toast({ title: "Failed to send", description: "An error occurred. Please try again.", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <Link href="/">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">New Order</h1>
          <p className="text-xs text-muted-foreground">{waitressName}</p>
        </div>
        <div className="w-10" />
      </header>

      {/* Customer name */}
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-border bg-card">
        <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Customer Name
        </label>
        <Input
          value={customerName}
          onChange={(e) => { setCustomerName(e.target.value); setNameError(false); }}
          placeholder="E.g. Table 4 / John"
          className={`h-12 text-lg bg-background border-border focus-visible:ring-primary ${nameError ? "border-destructive" : ""}`}
        />
        {nameError && <p className="text-destructive text-xs mt-1">Customer name is required</p>}
      </div>

      {/* Category tabs */}
      {menuLoading ? (
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => <Skeleton key={n} className="h-10 w-20 bg-card rounded-lg" />)}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[1, 2, 3, 4, 5, 6].map((n) => <Skeleton key={n} className="h-16 w-full bg-card rounded-lg" />)}
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Tab strip */}
          <div className="shrink-0 overflow-x-auto border-b border-border bg-card">
            <div className="flex gap-1 px-4 py-2 min-w-max">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
                    currentTab === cat
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Drink grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
              {itemsInTab.map((item) => {
                const qty = selected[item.id]?.quantity ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item.id, item.name)}
                    className={`relative rounded-xl border p-4 text-left transition-all active:scale-95 ${
                      qty > 0
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <span className="block font-semibold text-sm leading-snug">{item.name}</span>
                    {qty > 0 && (
                      <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-black w-6 h-6 flex items-center justify-center rounded-full">
                        {qty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Order summary + send */}
      <div className="shrink-0 border-t border-border bg-card">
        {selectedList.length > 0 && (
          <div className="px-4 pt-3 pb-2 space-y-2 max-h-48 overflow-y-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Order ({totalItems} item{totalItems !== 1 ? "s" : ""})
            </p>
            {selectedList.map((item) => (
              <div key={item.menuItemId} className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium flex-1 truncate">{item.menuItemName}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => changeQty(item.menuItemId, -1)}
                    className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                  >
                    {item.quantity === 1 ? <Trash2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(item.menuItemId, 1)}
                    className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-4">
          <Button
            onClick={handleSend}
            size="lg"
            className="w-full h-16 text-xl font-bold uppercase tracking-wider gap-3"
            disabled={createOrder.isPending}
          >
            <Send className="w-6 h-6" />
            {createOrder.isPending ? "Sending..." : selectedList.length === 0 ? "Send to Bar" : `Send ${totalItems} Item${totalItems !== 1 ? "s" : ""} to Bar`}
          </Button>
        </div>
      </div>
    </div>
  );
}
