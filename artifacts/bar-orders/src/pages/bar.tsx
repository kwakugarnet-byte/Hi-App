import { Link, Redirect } from "wouter";
import { ArrowLeft, CheckCircle2, Clock, Banknote, User, UserCog } from "lucide-react";
import {
  useGetOrderBatches,
  useCompleteOrderBatch,
  usePayOrderBatch,
  getGetOrderBatchesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function Bar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role, isLoading: authLoading } = useAuth();
  const [selectedWaiter, setSelectedWaiter] = useState<string | null>(null);

  if (!authLoading && role !== "bartender" && role !== "admin") {
    return <Redirect to="/" />;
  }

  const { data: batches, isLoading } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 5000,
    },
  });

  const completeBatch = useCompleteOrderBatch();
  const payBatch = usePayOrderBatch();

  const waiterNames = useMemo(() => {
    if (!batches) return [];
    const active = batches.filter((b) => b.status !== "paid");
    return [...new Set(active.map((b) => b.waitressName))].sort();
  }, [batches]);

  const pendingBatches = useMemo(() => {
    if (!batches) return [];
    return batches
      .filter((b) => b.status === "pending" && (!selectedWaiter || b.waitressName === selectedWaiter))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [batches, selectedWaiter]);

  const servedBatches = useMemo(() => {
    if (!batches) return [];
    return batches
      .filter((b) => b.status === "completed" && (!selectedWaiter || b.waitressName === selectedWaiter))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [batches, selectedWaiter]);

  const handleComplete = (id: number, customerName: string) => {
    completeBatch.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
          toast({ title: "Drinks Ready", description: `${customerName}'s order is served.` });
        },
        onError: () => {
          toast({ title: "Error", description: "Could not mark order as done.", variant: "destructive" });
        },
      }
    );
  };

  const handlePay = (id: number, customerName: string) => {
    payBatch.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
          toast({ title: "Paid & Cleared", description: `${customerName}'s order has been settled.` });
        },
        onError: () => {
          toast({ title: "Error", description: "Could not mark order as paid.", variant: "destructive" });
        },
      }
    );
  };

  const allClear = pendingBatches.length === 0 && servedBatches.length === 0;

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
                {pendingBatches.length} Pending &bull; {servedBatches.length} Awaiting Payment
              </p>
            </div>
          </div>
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
            {/* Pending — drinks to prepare */}
            {pendingBatches.length > 0 && (
              <section>
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4 px-1">
                  Preparing
                </h2>
                <div className="flex gap-6 items-start overflow-x-auto pb-2">
                  {pendingBatches.map((batch) => (
                    <Card
                      key={batch.id}
                      className="w-80 shrink-0 bg-card border-border shadow-xl flex flex-col overflow-hidden rounded-xl border-t-4 border-t-primary"
                    >
                      <CardContent className="p-0 flex flex-col h-full">
                        <div className="p-5 border-b border-border bg-secondary/50">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                            <User className="w-3 h-3" /> Customer
                          </p>
                          <h2 className="text-3xl font-black uppercase tracking-tight text-foreground truncate" title={batch.customerName}>
                            {batch.customerName}
                          </h2>
                          <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-400 uppercase tracking-wide bg-amber-400/10 px-2 py-0.5 rounded-full">
                              <UserCog className="w-3 h-3" />
                              {batch.waitressName}
                            </span>
                            <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {format(new Date(batch.createdAt), "h:mm a")}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 flex-1 space-y-3 bg-card">
                          {batch.items.map((item, i) => (
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
                            onClick={() => handleComplete(batch.id, batch.customerName)}
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

            {/* Served — awaiting payment */}
            {servedBatches.length > 0 && (
              <section>
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4 px-1 flex items-center gap-2">
                  <Banknote className="w-4 h-4" />
                  Awaiting Payment
                </h2>
                <div className="flex gap-6 items-start overflow-x-auto pb-2">
                  {servedBatches.map((batch) => (
                    <Card
                      key={batch.id}
                      className="w-72 shrink-0 bg-card/60 border-border/50 shadow-md flex flex-col overflow-hidden rounded-xl border-t-4 border-t-green-600/60"
                    >
                      <CardContent className="p-0 flex flex-col h-full">
                        <div className="p-4 border-b border-border/40 bg-secondary/20">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" /> Customer
                          </p>
                          <h2 className="text-xl font-black uppercase tracking-tight text-foreground/70 truncate" title={batch.customerName}>
                            {batch.customerName}
                          </h2>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400/70 uppercase tracking-wide bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                              <UserCog className="w-2.5 h-2.5" />
                              {batch.waitressName}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground/60">
                              <Clock className="w-2.5 h-2.5" />
                              {format(new Date(batch.createdAt), "h:mm a")}
                            </span>
                          </div>
                        </div>

                        <div className="px-4 py-3 flex-1 space-y-1 bg-card/40">
                          {batch.items.map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-muted-foreground/80">
                              <span className="text-sm font-semibold">{item.menuItemName}</span>
                              <span className="text-sm font-black">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <div className="p-4 pt-0 mt-auto">
                          <Button
                            size="lg"
                            variant="outline"
                            className="w-full h-12 text-base font-black uppercase tracking-widest border-green-600/60 text-green-500 hover:bg-green-600 hover:text-white hover:border-green-600 active:scale-[0.98] transition-all gap-2"
                            onClick={() => handlePay(batch.id, batch.customerName)}
                            disabled={payBatch.isPending}
                          >
                            <Banknote className="w-4 h-4" />
                            Paid — Clear
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
