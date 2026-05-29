import { useState, useMemo, useRef } from "react";
import { Link, Redirect } from "wouter";
import { ArrowLeft, Send, Plus, Minus, Trash2, AlertTriangle, RotateCcw, CheckCircle2, Search, X, ScanLine } from "lucide-react";
import {
  useGetMenuItems,
  useGetOrderBatches,
  useCreateOrderBatch,
  useResubmitOrderBatch,
  getGetMenuItemsQueryKey,
  getGetOrderBatchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type SelectedItem = { menuItemId: number; menuItemName: string; quantity: number };

function WaitressInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const waitressName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "Staff";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Record<number, SelectedItem>>({});
  const [nameError, setNameError] = useState(false);
  const [voidConfirmId, setVoidConfirmId] = useState<number | null>(null);
  const [quickCode, setQuickCode] = useState("");
  const [quickFlash, setQuickFlash] = useState<string | null>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  function flashFeedback(msg: string) {
    setQuickFlash(msg);
    setTimeout(() => setQuickFlash(null), 1800);
  }

  function tryQuickAdd(value: string, isEnter = false) {
    if (!menuItems || !value.trim()) return;
    const v = value.trim();

    if (isEnter) {
      const byBarcode = menuItems.find((i) => i.barcode && i.barcode === v);
      if (byBarcode) {
        addItem(byBarcode.id, byBarcode.name);
        setQuickCode("");
        flashFeedback(`+ ${byBarcode.name}`);
        return;
      }
    }

    const bySku = menuItems.filter((i) => i.sku && i.sku === v);
    if (bySku.length === 1) {
      addItem(bySku[0].id, bySku[0].name);
      setQuickCode("");
      flashFeedback(`+ ${bySku[0].name}`);
      return;
    }

    if (isEnter && bySku.length === 0) {
      flashFeedback("No match found");
    }
  }

  function handleQuickChange(val: string) {
    setQuickCode(val);
    if (/^\d{4}$/.test(val)) {
      tryQuickAdd(val, false);
    }
  }

  // Returned batches for this waitress (need correction)
  const returnedBatches = useMemo(() => {
    if (!batches) return [];
    return batches.filter((b) => b.status === "returned" && b.waitressName === waitressName);
  }, [batches, waitressName]);

  function handleVoid(batch: typeof returnedBatches[number]) {
    const correctionIds = (batch.correctionItemIds ?? []) as number[];
    const correctionQtyMap = new Map<number, number>();
    for (const id of correctionIds) correctionQtyMap.set(id, (correctionQtyMap.get(id) ?? 0) + 1);

    const remaining = batch.items
      .map((item) => {
        const removeQty = correctionQtyMap.get(item.id) ?? 0;
        const keepQty = item.quantity - removeQty;
        return keepQty > 0 ? { menuItemId: item.menuItemId, quantity: keepQty } : null;
      })
      .filter((x): x is { menuItemId: number; quantity: number } => x !== null);

    resubmitOrder.mutate(
      { id: batch.id, data: { items: remaining } },
      {
        onSuccess: () => {
          toast({
            title: remaining.length > 0 ? "Items Voided" : "Order Voided",
            description: remaining.length > 0
              ? `Flagged items removed. Remaining order sent back to the bar.`
              : `All items voided. The order has been cancelled.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
          setVoidConfirmId(null);
        },
        onError: () => {
          toast({ title: "Failed to void items", variant: "destructive" });
          setVoidConfirmId(null);
        },
      }
    );
  }

  // State for editing a returned batch's items inline
  const [editingReturn, setEditingReturn] = useState<{
    batchId: number;
    customerName: string;
    items: Record<number, SelectedItem>;
    flaggedCount: number;
  } | null>(null);

  function startEditing(batch: typeof returnedBatches[number]) {
    const correctionIds = (batch.correctionItemIds ?? []) as number[];
    // Build a qty map: count occurrences of each item id to get return quantity
    const correctionQtyMap = new Map<number, number>();
    for (const id of correctionIds) {
      correctionQtyMap.set(id, (correctionQtyMap.get(id) ?? 0) + 1);
    }

    const itemsToPreFill = correctionQtyMap.size > 0
      ? batch.items.filter((i) => correctionQtyMap.has(i.id))
      : batch.items;

    const itemMap: Record<number, SelectedItem> = {};
    for (const item of itemsToPreFill) {
      itemMap[item.menuItemId] = {
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        quantity: correctionQtyMap.get(item.id) ?? item.quantity,
      };
    }
    setSearchQuery("");
    setActiveTab(null);
    setEditingReturn({
      batchId: batch.id,
      customerName: batch.customerName,
      items: itemMap,
      flaggedCount: correctionQtyMap.size > 0 ? correctionQtyMap.size : batch.items.length,
    });
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
    return Array.from(new Set(menuItems.map((i) => i.category))).sort();
  }, [menuItems]);

  const currentTab = activeTab ?? "All";

  const itemsInTab = useMemo(() => {
    if (!menuItems) return [];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return [...menuItems].filter((i) =>
        i.name.toLowerCase().includes(q) || (i.sku && i.sku.toLowerCase().includes(q))
      ).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (currentTab === "All") {
      return [...menuItems].sort((a, b) => a.name.localeCompare(b.name));
    }
    return menuItems.filter((i) => i.category === currentTab).sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems, currentTab, searchQuery]);

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
          <button onClick={() => { setEditingReturn(null); setSearchQuery(""); setActiveTab(null); }} className="p-2 text-muted-foreground hover:text-foreground">
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

        {/* Search bar */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border bg-card">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drinks…"
              className="w-full h-10 pl-9 pr-9 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs */}
        {!searchQuery && (
          <div className="shrink-0 overflow-x-auto border-b border-border bg-card">
            <div className="flex gap-1 px-4 py-2 min-w-max">
              {["All", ...categories].map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setActiveTab(cat === "All" ? null : cat); setSearchQuery(""); }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
                    currentTab === cat
                      ? "bg-orange-500 text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drink grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {itemsInTab.length === 0 && searchQuery ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
              <Search className="w-6 h-6 opacity-30" />
              <p className="text-sm">No drinks match "{searchQuery}"</p>
            </div>
          ) : (
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
                    {searchQuery && (
                      <span className="block text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{item.category}</span>
                    )}
                    {qty > 0 && (
                      <span className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 flex items-center justify-center rounded-full">
                        {qty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3 w-full">
          <Link href="/">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex-1">
            <p className="font-black text-sm uppercase tracking-widest text-foreground">Take Order</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{waitressName}</p>
          </div>
        </div>
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
            {returnedBatches.map((batch) => {
              const ids = (batch.correctionItemIds ?? []) as number[];
              const qtyMap = new Map<number, number>();
              for (const id of ids) qtyMap.set(id, (qtyMap.get(id) ?? 0) + 1);
              const flaggedItems = qtyMap.size > 0
                ? batch.items.filter((i) => qtyMap.has(i.id))
                : batch.items;
              const flaggedLabel = flaggedItems.map((i) => `${qtyMap.get(i.id) ?? i.quantity}× ${i.menuItemName}`).join(", ");
              const isVoidPending = voidConfirmId === batch.id && resubmitOrder.isPending;

              return (
                <div key={batch.id} className="bg-card rounded-xl border border-orange-500/30 overflow-hidden">
                  {/* Main row */}
                  <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-tight text-foreground truncate">{batch.customerName}</p>
                      <p className="text-[11px] text-orange-400/80 mt-0.5 truncate">{flaggedLabel}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Void button */}
                      {voidConfirmId === batch.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground font-bold mr-1">Void?</span>
                          <button
                            onClick={() => setVoidConfirmId(null)}
                            className="px-2 py-1.5 rounded-lg border border-border text-[10px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors"
                          >
                            No
                          </button>
                          <button
                            onClick={() => handleVoid(batch)}
                            disabled={isVoidPending}
                            className="px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase transition-colors disabled:opacity-50"
                          >
                            {isVoidPending ? "..." : "Yes"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setVoidConfirmId(batch.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-wide transition-colors"
                        >
                          Void
                        </button>
                      )}
                      {/* Replace button */}
                      <button
                        onClick={() => { setVoidConfirmId(null); startEditing(batch); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-[10px] font-black uppercase tracking-wide transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Replace
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Order form ── */}
      <>
          {/* Quick Add / Barcode scan bar */}
          <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border bg-card">
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={quickInputRef}
                type="text"
                value={quickCode}
                onChange={(e) => handleQuickChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    tryQuickAdd(quickCode, true);
                  }
                }}
                placeholder="Scan barcode or type 4-digit code…"
                className="w-full h-10 pl-9 pr-9 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
              {quickCode && (
                <button onClick={() => setQuickCode("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {quickFlash && (
              <p className={`text-xs font-bold mt-1.5 px-1 ${quickFlash.startsWith("+") ? "text-primary" : "text-destructive"}`}>
                {quickFlash}
              </p>
            )}
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
              {/* Search bar */}
              <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border bg-card">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search drinks…"
                    className="w-full h-10 pl-9 pr-9 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Tab strip */}
              {!searchQuery && (
                <div className="shrink-0 overflow-x-auto border-b border-border bg-card">
                  <div className="flex gap-1 px-4 py-2 min-w-max">
                    {["All", ...categories].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => { setActiveTab(cat === "All" ? null : cat); setSearchQuery(""); }}
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
              )}

              {/* Drink grid */}
              <div className="flex-1 overflow-y-auto p-4">
                {itemsInTab.length === 0 && searchQuery ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                    <Search className="w-6 h-6 opacity-30" />
                    <p className="text-sm">No drinks match "{searchQuery}"</p>
                  </div>
                ) : (
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
                          <span className="block font-bold text-sm leading-snug">{item.name}</span>
                          {item.sku && (
                            <span className="block text-[10px] text-muted-foreground/60 mt-0.5 font-mono tracking-wider">{item.sku}</span>
                          )}
                          {searchQuery && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{item.category}</span>
                          )}
                          {qty > 0 && (
                            <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-black w-6 h-6 flex items-center justify-center rounded-full">
                              {qty}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order summary + customer name + send */}
          <div className="shrink-0 border-t border-border bg-card">
            {selectedList.length > 0 && (
              <div className="px-4 pt-3 pb-2 space-y-2 max-h-40 overflow-y-auto">
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

            {/* Customer name — entered after items */}
            <div className={`px-4 pt-3 pb-2 space-y-2 ${selectedList.length > 0 ? "border-t border-border" : ""}`}>
              {activeCustomers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeCustomers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => { setCustomerName(n); setNameError(false); }}
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border transition-all ${
                        customerName === n
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              <Input
                value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setNameError(false); }}
                placeholder={activeCustomers.length > 0 ? "New customer or select above…" : "Customer name (Table 4, John…)"}
                className={`h-11 bg-background border-border focus-visible:ring-primary ${nameError ? "border-destructive" : ""}`}
              />
              {nameError && <p className="text-destructive text-xs">Customer name is required</p>}
            </div>

            <div className="px-4 pb-4">
              <Button
                onClick={handleSend}
                size="lg"
                className="w-full h-14 text-lg font-bold uppercase tracking-wider gap-3"
                disabled={createOrder.isPending}
              >
                <Send className="w-5 h-5" />
                {createOrder.isPending ? "Sending..." : selectedList.length === 0 ? "Send to Bar" : `Send ${totalItems} Item${totalItems !== 1 ? "s" : ""} to Bar`}
              </Button>
            </div>
          </div>
      </>
    </div>
  );
}

export default function Waitress() {
  const { role, isLoading: authLoading } = useAuth();
  if (authLoading) return null;
  if (role !== "waitress" && role !== "admin") return <Redirect to="/" />;
  return <WaitressInner />;
}
