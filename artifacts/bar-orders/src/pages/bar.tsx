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

  const allGroups = useMemo(() => {
    if (!batches) return [];
    const active = batches.filter(
      (b) => b.status !== "paid" && (!selectedWaiter || b.waitressName === selectedWaiter)
    );
    return groupByCustomer(active);
  }, [batches, selectedWaiter]);

  const preparingGroups = useMemo(() => allGroups.filter((g) => g.hasPending), [allGroups]);
  const awaitingGroups = useMemo(() => allGroups.filter((g) => !g.hasPending), [allGroups]);

  const handleCompleteGroup = async (group: CustomerGroup) => {
    const pendingIds = group.rounds.filter((r) => r.status === "pending").map((r) => r.id);
    try {
      await Promise.all(pendingIds.map((id) => completeBatch.mutateAsync({ id })));
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Drinks Ready", description: `${group.customerName}'s order is served.` });
    } catch {
      toast({ title: "Error", description: "Could not mark order as done.", variant: "destructive" });
    }
  };

  const handlePayGroup = async (group: CustomerGroup) => {
    const ids = group.rounds.map((r) => r.id);
    try {
      await Promise.all(ids.map((id) => payBatch.mutateAsync({ id })));
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Paid & Cleared", description: `${group.customerName}'s bill has been settled.` });
    } catch {
      toast({ title: "Error", description: "Could not mark as paid.", variant: "destructive" });
    }
  };

  const allClear = preparingGroups.length === 0 && awaitingGroups.length === 0;

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
                {preparingGroups.length} Preparing &bull; {awaitingGroups.length} Awaiting Payment
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

            {/* Awaiting payment section */}
            {awaitingGroups.length > 0 && (
              <section>
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4 px-1 flex items-center gap-2">
                  <Banknote className="w-4 h-4" />
                  Awaiting Payment
                </h2>
                <div className="flex gap-6 items-start overflow-x-auto pb-2">
                  {awaitingGroups.map((group) => (
                    <Card
                      key={`${group.waitressName}|||${group.customerName}`}
                      className="w-72 shrink-0 bg-card/60 border-border/50 shadow-md flex flex-col overflow-hidden rounded-xl border-t-4 border-t-green-600/60"
                    >
                      <CardContent className="p-0 flex flex-col h-full">
                        {/* Customer header */}
                        <div className="p-4 border-b border-border/40 bg-secondary/20">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" /> Customer
                          </p>
                          <h2 className="text-xl font-black uppercase tracking-tight text-foreground/70 truncate" title={group.customerName}>
                            {group.customerName}
                          </h2>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400/70 uppercase tracking-wide bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                              <UserCog className="w-2.5 h-2.5" />
                              {group.waitressName}
                            </span>
                          </div>
                        </div>

                        {/* All items flat */}
                        <div className="px-4 py-3 flex-1 bg-card/40 space-y-1">
                          {group.rounds.flatMap((round) => round.items).map((item, i) => (
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
                            onClick={() => handlePayGroup(group)}
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
