import { useState, useMemo } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, Send, Plus, Minus, Trash2, AlertTriangle, RotateCcw, CheckCircle2 } from "lucide-react";
import {
  useGetMenuItems,
  useGetOrderBatches,
  useCreateOrderBatch,
  useResubmitOrderBatch,
  useGetMyShift,
  getGetMenuItemsQueryKey,
  getGetOrderBatchesQueryKey,
  getGetMyShiftQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type SelectedItem = { menuItemId: number; menuItemName: string; quantity: number };

export default function Waitress() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, role, isLoading: authLoading } = useAuth();

  if (!authLoading && role !== "waitress" && role !== "bartender" && role !== "admin") {
    return <Redirect to="/" />;
  }

  const waitressName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "Staff";

  const { data: shiftData, isLoading: shiftLoading } = useGetMyShift({
    query: { queryKey: getGetMyShiftQueryKey(), refetchInterval: 30000 },
  });

  // Day is "started" if there is an active (not ended) shift
  const dayStarted = !shiftLoading && !!shiftData?.shift && !shiftData.shift.endedAt;
  const dayEnded = !shiftLoading && !!shiftData?.shift && !!shiftData.shift.endedAt;

  const { data: menuItems, isLoading: menuLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  const { data: batches } = useGetOrderBatches({
    query: { queryKey: getGetOrderBatchesQueryKey(), refetchInterval: 10000 },
  });

  const createOrder = useCreateOrderBatch();
  const resubmitOrder = useResubmitOrderBatch();

  const [customerName, setCustomerName] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, SelectedItem>>({});
  const [nameError, setNameError] = useState(false);

  // Returned batches for this waitress (need correction)
  const returnedBatches = useMemo(() => {
    if (!batches) return [];
    return batches.filter((b) => b.status === "returned" && b.waitressName === waitressName);
  }, [batches, waitressName]);

  // State for editing a returned batch's items inline
  const [editingReturn, setEditingReturn] = useState<{
    batchId: number;
    customerName: string;
    items: Record<number, SelectedItem>;
    flaggedCount: number;
  } | null>(null);

  function startEditing(batch: typeof returnedBatches[number]) {
    const correctionIds = batch.correctionItemIds as number[] | null | undefined;
    const itemsToPreFill = correctionIds && correctionIds.length > 0
      ? batch.items.filter((i) => correctionIds.includes(i.id))
      : batch.items;

    const itemMap: Record<number, SelectedItem> = {};
    for (const item of itemsToPreFill) {
      itemMap[item.menuItemId] = {
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        quantity: item.quantity,
      };
    }
    setEditingReturn({ batchId: batch.id, customerName: batch.customerName, items: itemMap, flaggedCount: correctionIds?.length ?? batch.items.length });
  }

  function editQty(id: number, name: string, delta: number) {
    if (!editingReturn) return;
    setEditingReturn((prev) => {
      if (!prev) return prev;
      const existing = prev.items[id];
      const newQty = (existing?.quantity ?? 0) + delta;
      if (newQty <= 0) {
        const next = { ...prev.items };
        delete next[id];
        return { ...prev, items: next };
      }
      return { ...prev, items: { ...prev.items, [id]: { menuItemId: id, menuItemName: name, quantity: newQty } } };
    });
  }

  function addEditItem(id: number, name: string) {
    editQty(id, name, 1);
  }

  function handleResubmit() {
    if (!editingReturn) return;
    const items = Object.values(editingReturn.items).map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }));
    if (items.length === 0) {
      toast({ title: "No items", description: "Add at least one drink.", variant: "destructive" });
      return;
    }
    resubmitOrder.mutate(
      { id: editingReturn.batchId, data: { items } },
      {
        onSuccess: () => {
          toast({ title: "Order Resubmitted", description: `Corrected order for ${editingReturn.customerName} sent back to the bar.` });
          queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
          setEditingReturn(null);
        },
        onError: () => {
          toast({ title: "Failed to resubmit", variant: "destructive" });
        },
      }
    );
  }

  const activeCustomers = useMemo(() => {
    if (!batches) return [];
    const names = batches
      .filter((b) => b.status !== "paid" && b.waitressName === waitressName)
      .map((b) => b.customerName);
    return Array.from(new Set(names)).sort();
  }, [batches, waitressName]);

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

  // === Correction overlay ===
  if (editingReturn && menuItems) {
    const editList = Object.values(editingReturn.items);
    const totalEditItems = editList.reduce((s, i) => s + i.quantity, 0);
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
        <header className="sticky top-0 z-20 bg-orange-500/10 border-b border-orange-500/40 px-4 py-3 flex items-center justify-between shrink-0">
          <button onClick={() => setEditingReturn(null)} className="p-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-sm font-black uppercase tracking-wide text-orange-400">Correcting Order</h1>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">{editingReturn.customerName}</p>
          </div>
          <div className="w-10" />
        </header>

        {/* Bartender note */}
        <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
          <p className="text-xs text-orange-300 leading-snug">
            The bartender flagged <span className="font-black">{editingReturn.flaggedCount} item{editingReturn.flaggedCount !== 1 ? "s" : ""}</span> for correction. Adjust the order below and send it back.
          </p>
        </div>

        {/* Category tabs */}
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
              const qty = editingReturn.items[item.id]?.quantity ?? 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addEditItem(item.id, item.name)}
                  className={`relative rounded-xl border p-4 text-left transition-all active:scale-95 ${
                    qty > 0
                      ? "border-orange-500 bg-orange-500/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-orange-500/50 hover:text-foreground"
                  }`}
                >
                  <span className="block font-semibold text-sm leading-snug">{item.name}</span>
                  {qty > 0 && (
                    <span className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 flex items-center justify-center rounded-full">
                      {qty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Correction summary + send back */}
        <div className="shrink-0 border-t border-border bg-card">
          {editList.length > 0 && (
            <div className="px-4 pt-3 pb-2 space-y-2 max-h-48 overflow-y-auto">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-400">
                Corrected Order ({totalEditItems} item{totalEditItems !== 1 ? "s" : ""})
              </p>
              {editList.map((item) => (
                <div key={item.menuItemId} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium flex-1 truncate">{item.menuItemName}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => editQty(item.menuItemId, item.menuItemName, -1)}
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                    >
                      {item.quantity === 1 ? <Trash2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => editQty(item.menuItemId, item.menuItemName, 1)}
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
              onClick={handleResubmit}
              size="lg"
              className="w-full h-16 text-xl font-bold uppercase tracking-wider gap-3 bg-orange-500 hover:bg-orange-400 text-white"
              disabled={resubmitOrder.isPending}
            >
              <CheckCircle2 className="w-6 h-6" />
              {resubmitOrder.isPending ? "Sending..." : `Send ${totalEditItems} Item${totalEditItems !== 1 ? "s" : ""} Back to Bar`}
            </Button>
          </div>
        </div>
      </div>
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

      {/* Returned orders alert */}
      {returnedBatches.length > 0 && (
        <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
            <p className="text-xs font-black uppercase tracking-widest text-orange-400">
              {returnedBatches.length} Order{returnedBatches.length !== 1 ? "s" : ""} Need{returnedBatches.length === 1 ? "s" : ""} Correction
            </p>
          </div>
          <div className="space-y-2">
            {returnedBatches.map((batch) => (
              <div key={batch.id} className="bg-card rounded-xl border border-orange-500/30 px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight text-foreground truncate">{batch.customerName}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {batch.items.map((i) => `${i.quantity}× ${i.menuItemName}`).join(", ")}
                  </p>
                </div>
                <button
                  onClick={() => startEditing(batch)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-black uppercase tracking-wide transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Correct
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Order form — blocked if day not started ── */}
      {shiftLoading ? (
        <div className="flex-1 flex items-center justify-center opacity-40">
          <Skeleton className="w-48 h-8 bg-card rounded-lg" />
        </div>
      ) : !dayStarted ? (
        /* Blocked state */
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5 text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Send className="w-8 h-8 text-muted-foreground opacity-40" />
          </div>
          <div>
            <p className="text-base font-black uppercase tracking-widest text-foreground">
              {dayEnded ? "Your Shift Has Ended" : "Day Not Started"}
            </p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {dayEnded
                ? "Your shift is over for today. Orders cannot be taken after the day is ended."
                : "You need to start your day before taking orders. Go to the Home screen and tap Start Day."}
            </p>
          </div>
          <Link href="/">
            <button className="mt-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-sm hover:bg-primary/90 transition-colors">
              Go to Home
            </button>
          </Link>
        </div>
      ) : (
        /* Normal order form */
        <>
          {/* Customer name */}
          <div className="px-4 pt-4 pb-3 shrink-0 border-b border-border bg-card space-y-3">
            {activeCustomers.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Active Customers
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeCustomers.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setCustomerName(name); setNameError(false); }}
                      className={`px-3 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide border transition-all ${
                        customerName === name
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {activeCustomers.length > 0 ? "Or New Customer" : "Customer Name"}
              </label>
              <Input
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setNameError(false); }}
                placeholder="E.g. Table 4 / John"
                className={`h-12 text-lg bg-background border-border focus-visible:ring-primary ${nameError ? "border-destructive" : ""}`}
              />
              {nameError && <p className="text-destructive text-xs mt-1">Customer name is required</p>}
            </div>
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
        </>
      )}
    </div>
  );
}
