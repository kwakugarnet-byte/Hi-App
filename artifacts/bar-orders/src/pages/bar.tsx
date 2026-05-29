import { Link, Redirect } from "wouter";
import { ArrowLeft, CheckCircle2, Clock, MapPin, Phone, ShoppingBag, Truck, User, UserCog, X } from "lucide-react";
import {
  useGetOrderBatches,
  useCompleteOrderBatch,
  getGetOrderBatchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

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

type CustomerOrder = {
  id: number;
  customerName: string;
  phone: string | null;
  orderType: string | null;
  deliveryLocation: string | null;
  status: string;
  createdAt: string;
  items: BatchItem[];
};

function groupByCustomer(
  batches: { id: number; customerName: string; waitressName: string; status: string; createdAt: string; items: BatchItem[]; saleType?: string | null }[]
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
  const { role, isLoading: authLoading } = useAuth();
  const [selectedWaiter, setSelectedWaiter] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const { data: batches, isLoading, refetch } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 3000,
      refetchOnWindowFocus: true,
    },
  });

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refetch]);

  const completeBatch = useCompleteOrderBatch();

  // ── Customer orders (saleType === "customer_order") ──────────────────────
  const incomingOrders = useMemo((): CustomerOrder[] => {
    if (!batches) return [];
    return (batches as Array<typeof batches[number] & { phone?: string | null; orderType?: string | null; deliveryLocation?: string | null }>)
      .filter((b) => b.saleType === "customer_order" && b.status !== "paid" && b.status !== "returned")
      .map((b) => ({
        id: b.id,
        customerName: b.customerName,
        phone: b.phone ?? null,
        orderType: b.orderType ?? null,
        deliveryLocation: b.deliveryLocation ?? null,
        status: b.status,
        createdAt: b.createdAt,
        items: b.items,
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [batches]);

  // ── Regular table orders (exclude customer orders and bar holds) ─────────
  const waiterNames = useMemo(() => {
    if (!batches) return [];
    const active = batches.filter(
      (b) => b.status !== "paid" && b.status !== "returned" && b.saleType !== "bar" && b.saleType !== "customer_order"
    );
    return [...new Set(active.map((b) => b.waitressName))].sort();
  }, [batches]);

  const allGroups = useMemo(() => {
    if (!batches) return [];
    const active = batches.filter(
      (b) =>
        b.status !== "paid" &&
        b.status !== "returned" &&
        b.saleType !== "bar" &&
        b.saleType !== "customer_order" &&
        (!selectedWaiter || b.waitressName === selectedWaiter)
    );
    return groupByCustomer(active);
  }, [batches, selectedWaiter]);

  const preparingGroups = useMemo(() => allGroups.filter((g) => g.hasPending), [allGroups]);

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

  const handleAcceptOrder = useCallback(async (order: CustomerOrder) => {
    try {
      await completeBatch.mutateAsync({ id: order.id });
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Order Accepted", description: `${order.customerName}'s order is being prepared.` });
    } catch {
      toast({ title: "Error", description: "Could not accept order.", variant: "destructive" });
    }
  }, [completeBatch, queryClient, toast]);

  const handleRejectOrder = useCallback(async (order: CustomerOrder) => {
    setRejectingId(order.id);
    try {
      const res = await fetch(`${BASE}/api/order-batches/${order.id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Order Rejected", description: `${order.customerName}'s order has been rejected.` });
    } catch {
      toast({ title: "Error", description: "Could not reject order.", variant: "destructive" });
    } finally {
      setRejectingId(null);
    }
  }, [queryClient, toast]);

  const handleCustomerOrderDone = useCallback(async (order: CustomerOrder) => {
    try {
      const res = await fetch(`${BASE}/api/order-batches/${order.id}/pay`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: order.customerName, waitressName: "Online" }),
      });
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Order Done", description: `${order.customerName}'s order marked as complete.` });
    } catch {
      toast({ title: "Error", description: "Could not complete order.", variant: "destructive" });
    }
  }, [queryClient, toast]);

  if (!authLoading && role !== "bartender" && role !== "admin") {
    return <Redirect to="/" />;
  }

  const allClear = preparingGroups.length === 0 && incomingOrders.length === 0;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
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
                {preparingGroups.length} Preparing
                {incomingOrders.filter((o) => o.status === "pending").length > 0 && (
                  <span className="ml-2 text-orange-400">
                    · {incomingOrders.filter((o) => o.status === "pending").length} New
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

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
            {/* ── Incoming Customer Orders ─────────────────────────────── */}
            {incomingOrders.length > 0 && (
              <section>
                <h2 className="text-xs font-black uppercase tracking-widest text-orange-400 mb-4 px-1 flex items-center gap-2">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Customer Orders
                  <span className="bg-orange-400/20 text-orange-400 px-1.5 py-0.5 rounded-full text-[10px]">
                    {incomingOrders.length}
                  </span>
                </h2>
                <div className="flex gap-6 items-start overflow-x-auto pb-2">
                  {incomingOrders.map((order) => (
                    <Card
                      key={order.id}
                      className={`w-80 shrink-0 bg-card border-border shadow-xl flex flex-col overflow-hidden rounded-xl border-t-4 ${
                        order.status === "pending" ? "border-t-orange-500" : "border-t-blue-500"
                      }`}
                    >
                      <CardContent className="p-0 flex flex-col h-full">
                        <div className={`p-5 border-b border-border ${order.status === "pending" ? "bg-orange-500/5" : "bg-blue-500/5"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                              order.status === "pending"
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-blue-500/20 text-blue-400"
                            }`}>
                              {order.status === "pending" ? "New Order" : "In Progress"}
                            </span>
                            {order.orderType && (
                              <span className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                order.orderType === "delivery"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : "bg-green-500/20 text-green-400"
                              }`}>
                                {order.orderType === "delivery"
                                  ? <><Truck className="w-3 h-3" /> Delivery</>
                                  : <><ShoppingBag className="w-3 h-3" /> Pickup</>
                                }
                              </span>
                            )}
                          </div>
                          <h2 className="text-2xl font-black uppercase tracking-tight text-foreground truncate" title={order.customerName}>
                            {order.customerName}
                          </h2>
                          <div className="mt-2 space-y-1">
                            {order.phone && (
                              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span>{order.phone}</span>
                              </div>
                            )}
                            {order.deliveryLocation && (
                              <div className="flex items-start gap-1.5 text-xs font-bold text-purple-400">
                                <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                                <span className="break-words">{order.deliveryLocation}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {format(new Date(order.createdAt), "h:mm a")}
                            </div>
                          </div>
                        </div>

                        <div className="p-5 flex-1 bg-card space-y-2">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
                              <span className="text-base font-bold tracking-tight">{item.menuItemName}</span>
                              <span className="text-xl font-black text-primary px-2.5 py-0.5 bg-primary/10 rounded-md">
                                x{item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="p-4 pt-0 mt-auto space-y-2">
                          {order.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10 font-black uppercase text-xs"
                                onClick={() => handleRejectOrder(order)}
                                disabled={rejectingId === order.id}
                              >
                                <X className="w-3.5 h-3.5 mr-1" />
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 bg-orange-500 hover:bg-orange-400 text-black font-black uppercase text-xs"
                                onClick={() => handleAcceptOrder(order)}
                                disabled={completeBatch.isPending}
                              >
                                Accept
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="lg"
                              className="w-full h-14 text-lg font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
                              onClick={() => handleCustomerOrderDone(order)}
                            >
                              Done
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* ── Table Orders ─────────────────────────────────────────── */}
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
