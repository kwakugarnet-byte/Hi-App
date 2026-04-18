import { Link, Redirect } from "wouter";
import { ArrowLeft, CheckCircle2, Clock, User, UserCog, Plus, Minus, Trash2, Send, X } from "lucide-react";
import {
  useGetOrderBatches,
  useCompleteOrderBatch,
  useCreateDirectSale,
  useGetMenuItems,
  getGetOrderBatchesQueryKey,
  getGetMenuItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

type BatchItem = { menuItemName: string; menuItemId: number; quantity: number; pricePence: number };

type BatchRound = {
  id: number;
  status: string;
  createdAt: string;
  items: BatchItem[];
};

type CustomerGroup = {
  customerName: string;
  waitressName: string;
  firstOrderAt: string;
  rounds: BatchRound[];
  hasPending: boolean;
};

type SelectedItem = { menuItemId: number; menuItemName: string; quantity: number };

function groupByCustomer(
  batches: { id: number; customerName: string; waitressName: string; status: string; createdAt: string; items: BatchItem[] }[]
): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();

  for (const batch of batches) {
    const key = `${batch.waitressName}|||${batch.customerName}`;
    if (!map.has(key)) {
      map.set(key, {
        customerName: batch.customerName,
        waitressName: batch.waitressName,
        firstOrderAt: batch.createdAt,
        rounds: [],
        hasPending: false,
      });
    }
    const group = map.get(key)!;
    if (batch.status === "pending") group.hasPending = true;
    if (new Date(batch.createdAt) < new Date(group.firstOrderAt)) {
      group.firstOrderAt = batch.createdAt;
    }
    group.rounds.push({ id: batch.id, status: batch.status, createdAt: batch.createdAt, items: batch.items });
  }

  for (const group of map.values()) {
    group.rounds.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  return [...map.values()].sort(
    (a, b) => new Date(a.firstOrderAt).getTime() - new Date(b.firstOrderAt).getTime()
  );
}

export default function Bar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role, user, isLoading: authLoading } = useAuth();
  const [selectedWaiter, setSelectedWaiter] = useState<string | null>(null);

  // Direct sale state
  const [showDirectSale, setShowDirectSale] = useState(false);
  const [dsCustomer, setDsCustomer] = useState("");
  const [dsCustomerError, setDsCustomerError] = useState(false);
  const [dsSelected, setDsSelected] = useState<Record<number, SelectedItem>>({});
  const [dsActiveTab, setDsActiveTab] = useState<string | null>(null);

  const { data: batches, isLoading, refetch } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 3000,
      refetchOnWindowFocus: true,
    },
  });

  const { data: menuItems } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  // Immediately refetch when the screen becomes visible (e.g. wakes from sleep)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refetch();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refetch]);

  const completeBatch = useCompleteOrderBatch();
  const createDirectSale = useCreateDirectSale();

  const bartenderName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.email ?? "Bar";

  const waiterNames = useMemo(() => {
    if (!batches) return [];
    const active = batches.filter((b) => b.status !== "paid" && b.status !== "returned");
    return [...new Set(active.map((b) => b.waitressName))].sort();
  }, [batches]);

  const allGroups = useMemo(() => {
    if (!batches) return [];
    const active = batches.filter(
      (b) => b.status !== "paid" && b.status !== "returned" && (!selectedWaiter || b.waitressName === selectedWaiter)
    );
    return groupByCustomer(active);
  }, [batches, selectedWaiter]);

  const preparingGroups = useMemo(() => allGroups.filter((g) => g.hasPending), [allGroups]);

  // Existing active customers (for quick-pick in direct sale)
  const activeCustomers = useMemo(() => {
    if (!batches) return [];
    const names = batches.filter((b) => b.status !== "paid").map((b) => b.customerName);
    return Array.from(new Set(names)).sort();
  }, [batches]);

  const categories = useMemo(() => {
    if (!menuItems) return [];
    return Array.from(new Set(menuItems.map((i) => i.category)));
  }, [menuItems]);

  const dsCurrentTab = dsActiveTab ?? categories[0] ?? null;

  const dsItemsInTab = useMemo(() => {
    if (!menuItems || !dsCurrentTab) return [];
    return menuItems.filter((i) => i.category === dsCurrentTab);
  }, [menuItems, dsCurrentTab]);

  const dsSelectedList = Object.values(dsSelected);
  const dsTotalItems = dsSelectedList.reduce((s, i) => s + i.quantity, 0);

  function dsAddItem(id: number, name: string) {
    setDsSelected((prev) => {
      const existing = prev[id];
      return { ...prev, [id]: { menuItemId: id, menuItemName: name, quantity: (existing?.quantity ?? 0) + 1 } };
    });
  }

  function dsChangeQty(id: number, delta: number) {
    setDsSelected((prev) => {
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

  function openDirectSale() {
    setDsCustomer("");
    setDsCustomerError(false);
    setDsSelected({});
    setDsActiveTab(null);
    setShowDirectSale(true);
  }

  function handleDirectSaleSubmit() {
    if (!dsCustomer.trim()) {
      setDsCustomerError(true);
      return;
    }
    if (dsSelectedList.length === 0) {
      toast({ title: "No items", description: "Add at least one drink.", variant: "destructive" });
      return;
    }
    createDirectSale.mutate(
      {
        data: {
          customerName: dsCustomer.trim(),
          waitressName: bartenderName,
          items: dsSelectedList.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
          toast({ title: "Sale recorded", description: `${dsCustomer.trim()}'s order added directly to bills.` });
          setShowDirectSale(false);
        },
        onError: () => {
          toast({ title: "Failed to record sale", variant: "destructive" });
        },
      }
    );
  }

  const handleCompleteGroup = async (group: CustomerGroup) => {
    const pendingIds = group.rounds.filter((r) => r.status === "pending").map((r) => r.id);
    try {
      await Promise.all(pendingIds.map((id) => completeBatch.mutateAsync({ id })));
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Drinks Ready", description: `${group.customerName}'s order is served — bill sent.` });
    } catch {
      toast({ title: "Error", description: "Could not mark order as done.", variant: "destructive" });
    }
  };

  if (!authLoading && role !== "bartender" && role !== "admin") {
    return <Redirect to="/" />;
  }

  const allClear = preparingGroups.length === 0;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      {/* Direct Sale Overlay */}
      {showDirectSale && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <header className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
            <button
              onClick={() => setShowDirectSale(false)}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h1 className="text-sm font-black uppercase tracking-wide text-primary">Direct Sale</h1>
              <p className="text-xs text-muted-foreground">Skip bar display — goes straight to bill</p>
            </div>
            <div className="w-10" />
          </header>

          {/* Customer name */}
          <div className="px-4 pt-4 pb-3 shrink-0 border-b border-border bg-card space-y-3">
            {activeCustomers.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Existing Customers</p>
                <div className="flex flex-wrap gap-2">
                  {activeCustomers.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setDsCustomer(name); setDsCustomerError(false); }}
                      className={`px-3 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide border transition-all ${
                        dsCustomer === name
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
                value={dsCustomer}
                onChange={(e) => { setDsCustomer(e.target.value); setDsCustomerError(false); }}
                placeholder="E.g. Table 4 / John"
                className={`h-12 text-lg bg-background border-border focus-visible:ring-primary ${dsCustomerError ? "border-destructive" : ""}`}
              />
              {dsCustomerError && <p className="text-destructive text-xs mt-1">Customer name is required</p>}
            </div>
          </div>

          {/* Category tabs */}
          <div className="shrink-0 overflow-x-auto border-b border-border bg-card">
            <div className="flex gap-1 px-4 py-2 min-w-max">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setDsActiveTab(cat)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
                    dsCurrentTab === cat
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
              {dsItemsInTab.map((item) => {
                const qty = dsSelected[item.id]?.quantity ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => dsAddItem(item.id, item.name)}
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

          {/* Summary + send */}
          <div className="shrink-0 border-t border-border bg-card">
            {dsSelectedList.length > 0 && (
              <div className="px-4 pt-3 pb-2 space-y-2 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Order ({dsTotalItems} item{dsTotalItems !== 1 ? "s" : ""})
                </p>
                {dsSelectedList.map((item) => (
                  <div key={item.menuItemId} className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium flex-1 truncate">{item.menuItemName}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => dsChangeQty(item.menuItemId, -1)}
                        className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                      >
                        {item.quantity === 1 ? <Trash2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => dsChangeQty(item.menuItemId, 1)}
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
                onClick={handleDirectSaleSubmit}
                size="lg"
                className="w-full h-16 text-xl font-bold uppercase tracking-wider gap-3"
                disabled={createDirectSale.isPending}
              >
                <Send className="w-6 h-6" />
                {createDirectSale.isPending
                  ? "Saving..."
                  : dsSelectedList.length === 0
                    ? "Record Sale"
                    : `Record ${dsTotalItems} Item${dsTotalItems !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-10 bg-card border-b border-border shadow-md shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-6 h-6" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-widest text-primary leading-none">Bar Display</h1>
              <p className="text-sm font-bold text-muted-foreground tracking-widest uppercase mt-1">
                {preparingGroups.length} Order{preparingGroups.length !== 1 ? "s" : ""} Preparing
              </p>
            </div>
          </div>
          {/* Direct Sale button */}
          <button
            onClick={openDirectSale}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-black text-sm uppercase tracking-wide hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Direct Sale
          </button>
        </div>

        {/* Waiter filter chips */}
        {waiterNames.length > 1 && (
          <div className="px-6 pb-3 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Filter:</span>
            <button
              onClick={() => setSelectedWaiter(null)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border transition-colors ${
                selectedWaiter === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              All
            </button>
            {waiterNames.map((name) => (
              <button
                key={name}
                onClick={() => setSelectedWaiter(selectedWaiter === name ? null : name)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border transition-colors ${
                  selectedWaiter === name
                    ? "bg-amber-500 text-black border-amber-500"
                    : "border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-400"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-10">
        {isLoading && !batches ? (
          <div className="flex gap-6 items-start overflow-x-auto">
            <Skeleton className="w-80 h-96 shrink-0 bg-card rounded-xl" />
            <Skeleton className="w-80 h-96 shrink-0 bg-card rounded-xl" />
          </div>
        ) : allClear ? (
          <div className="h-64 flex flex-col items-center justify-center opacity-50">
            <CheckCircle2 className="w-24 h-24 mb-6 text-muted-foreground" />
            <h2 className="text-3xl font-black tracking-wider uppercase text-muted-foreground">All Clear</h2>
            <p className="text-lg mt-2 text-muted-foreground font-medium">Waiting for new orders...</p>
          </div>
        ) : (
          <>
            {/* Preparing section */}
            {preparingGroups.length > 0 && (
              <section>
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4 px-1">
                  Preparing
                </h2>
                <div className="flex gap-6 items-start overflow-x-auto pb-2">
                  {preparingGroups.map((group) => (
                    <Card
                      key={`${group.waitressName}|||${group.customerName}`}
                      className="w-80 shrink-0 bg-card border-border shadow-xl flex flex-col overflow-hidden rounded-xl border-t-4 border-t-primary"
                    >
                      <CardContent className="p-0 flex flex-col h-full">
                        {/* Customer header */}
                        <div className="p-5 border-b border-border bg-secondary/50">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                            <User className="w-3 h-3" /> Customer
                          </p>
                          <h2 className="text-3xl font-black uppercase tracking-tight text-foreground truncate" title={group.customerName}>
                            {group.customerName}
                          </h2>
                          <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-400 uppercase tracking-wide bg-amber-400/10 px-2 py-0.5 rounded-full">
                              <UserCog className="w-3 h-3" />
                              {group.waitressName}
                            </span>
                            <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {format(new Date(group.firstOrderAt), "h:mm a")}
                            </span>
                          </div>
                        </div>

                        {/* All items flat */}
                        <div className="p-5 flex-1 bg-card space-y-3">
                          {group.rounds.flatMap((round) => round.items).map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                              <span className="text-xl font-bold tracking-tight">{item.menuItemName}</span>
                              <span className="text-2xl font-black text-primary px-3 py-1 bg-primary/10 rounded-md">
                                x{item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="p-5 pt-0 mt-auto">
                          <Button
                            size="lg"
                            className="w-full h-16 text-xl font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
                            onClick={() => handleCompleteGroup(group)}
                            disabled={completeBatch.isPending}
                          >
                            Done
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
