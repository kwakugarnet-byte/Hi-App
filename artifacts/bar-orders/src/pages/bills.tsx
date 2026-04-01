import { useMemo, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Clock, CheckCircle2, Hourglass, Receipt, Printer, Banknote, TrendingUp, ShieldCheck } from "lucide-react";
import {
  useGetOrderBatches,
  getGetOrderBatchesQueryKey,
  usePayOrderBatch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

type BatchItem = { menuItemName: string; menuItemId: number; quantity: number; pricePence: number };

type Round = {
  id: number;
  status: string;
  createdAt: string;
  items: BatchItem[];
  subtotal: number;
};

type GroupedCustomer = {
  customerName: string;
  waitressName: string;
  overallStatus: "pending" | "completed";
  firstOrderAt: string;
  rounds: Round[];
  total: number;
};

function groupBatches(
  batches: { id: number; customerName: string; waitressName: string; status: string; createdAt: string; items: BatchItem[] }[]
): GroupedCustomer[] {
  const map = new Map<string, GroupedCustomer>();

  for (const batch of batches) {
    const key = `${batch.waitressName}|||${batch.customerName}|||${format(new Date(batch.createdAt), "yyyy-MM-dd")}`;
    if (!map.has(key)) {
      map.set(key, {
        customerName: batch.customerName,
        waitressName: batch.waitressName,
        overallStatus: "completed",
        firstOrderAt: batch.createdAt,
        rounds: [],
        total: 0,
      });
    }
    const group = map.get(key)!;

    if (batch.status === "pending") group.overallStatus = "pending";

    if (new Date(batch.createdAt) < new Date(group.firstOrderAt)) {
      group.firstOrderAt = batch.createdAt;
    }

    const subtotal = batch.items.reduce((s, i) => s + i.pricePence * i.quantity, 0);
    group.rounds.push({ id: batch.id, status: batch.status, createdAt: batch.createdAt, items: batch.items, subtotal });
  }

  for (const group of map.values()) {
    group.rounds.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    group.total = group.rounds.reduce((s, r) => s + r.subtotal, 0);
  }

  return [...map.values()].sort(
    (a, b) => new Date(a.firstOrderAt).getTime() - new Date(b.firstOrderAt).getTime()
  );
}

function printBill(customer: GroupedCustomer) {
  const roundRows = customer.rounds
    .map(
      (round, idx) => {
        const itemRows = round.items
          .map((item) => `
          <tr>
            <td>${item.quantity}&times;</td>
            <td>${item.menuItemName}</td>
            <td class="price">${formatPrice(item.pricePence * item.quantity)}</td>
          </tr>`)
          .join("");
        return `
        <tr class="round-header"><td colspan="3">Round ${idx + 1} &mdash; ${format(new Date(round.createdAt), "h:mm a")}</td></tr>
        ${itemRows}
        <tr class="subtotal-row">
          <td colspan="2">Subtotal</td>
          <td class="price">${formatPrice(round.subtotal)}</td>
        </tr>
        ${idx < customer.rounds.length - 1 ? '<tr class="gap-row"><td colspan="3"></td></tr>' : ""}
        `;
      }
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt — ${customer.customerName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 13px; width: 300px; margin: 0 auto; padding: 16px; }
    .center { text-align: center; }
    .bar-name { font-size: 20px; font-weight: bold; letter-spacing: 2px; margin-bottom: 2px; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
    .customer { font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 4px 0; }
    .meta { font-size: 11px; color: #555; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    td { padding: 2px 2px; vertical-align: top; }
    td:first-child { width: 28px; }
    td.price { text-align: right; white-space: nowrap; }
    .round-header td { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; padding-top: 6px; padding-bottom: 2px; }
    .subtotal-row td { font-size: 11px; color: #555; border-top: 1px dotted #ccc; padding-top: 2px; }
    .gap-row td { height: 6px; }
    .total-row { border-top: 2px solid #000; margin-top: 8px; padding-top: 8px; display: flex; justify-content: space-between; align-items: baseline; }
    .total-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .total-amount { font-size: 22px; font-weight: bold; }
    .footer { font-size: 11px; color: #777; margin-top: 12px; }
    @media print { body { width: 100%; padding: 0; } }
  </style>
</head>
<body>
  <div class="center">
    <div class="bar-name">THE BAR</div>
    <div class="label">Receipt</div>
  </div>
  <div class="divider"></div>
  <div class="label">Customer</div>
  <div class="customer">${customer.customerName}</div>
  <div class="meta">Served by: ${customer.waitressName}</div>
  <div class="meta">Date: ${format(new Date(customer.firstOrderAt), "dd MMM yyyy")}</div>
  <div class="divider"></div>
  <table>
    ${roundRows}
  </table>
  <div class="divider"></div>
  <div class="total-row">
    <span class="total-label">Total</span>
    <span class="total-amount">${formatPrice(customer.total)}</span>
  </div>
  <div class="divider"></div>
  <div class="center footer">Thank you for your visit!</div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=380,height=600");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export default function Bills() {
  const { isWaitress, isAdmin, isBartender } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedWaiter, setSelectedWaiter] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "history">("active");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isWaitress) setLocation("/");
  }, [isWaitress]);

  const { data: batches, isLoading } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 10000,
    },
  });

  const payBatch = usePayOrderBatch();

  const waiterNames = useMemo(() => {
    if (!batches) return [];
    const active = batches.filter((b) => b.status !== "paid");
    return [...new Set(active.map((b) => b.waitressName))].sort();
  }, [batches]);

  const activeCustomers = useMemo(() => {
    if (!batches) return [];
    const unpaid = batches.filter(
      (b) => b.status !== "paid" && (!selectedWaiter || b.waitressName === selectedWaiter)
    );
    return groupBatches(unpaid);
  }, [batches, selectedWaiter]);

  const historyCustomers = useMemo(() => {
    if (!batches) return [];
    const paid = batches.filter((b) => b.status === "paid");
    return groupBatches(paid).reverse();
  }, [batches]);

  const grandTotal = useMemo(
    () => activeCustomers.reduce((sum, c) => sum + c.total, 0),
    [activeCustomers]
  );

  const totalSales = useMemo(
    () => historyCustomers.reduce((sum, c) => sum + c.total, 0),
    [historyCustomers]
  );

  const handleMarkPaid = async (customer: GroupedCustomer) => {
    const ids = customer.rounds.map((r) => r.id);
    try {
      await Promise.all(ids.map((id) => payBatch.mutateAsync({ id })));
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Paid & Cleared", description: `${customer.customerName}'s bill settled.` });
    } catch {
      toast({ title: "Error", description: "Could not mark as paid.", variant: "destructive" });
    }
  };

  const activeSubtitle = selectedWaiter
    ? `${activeCustomers.length} customer${activeCustomers.length !== 1 ? "s" : ""} — ${selectedWaiter}`
    : `${activeCustomers.length} active customer${activeCustomers.length !== 1 ? "s" : ""}`;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b border-border shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide text-primary">Sales & Bills</h1>
            <p className="text-xs text-muted-foreground">
              {tab === "active" ? activeSubtitle : `${historyCustomers.length} paid sales`}
            </p>
          </div>
          <div className="w-10" />
        </div>

        {/* Tabs */}
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => setTab("active")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border transition-colors ${
              tab === "active"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            Active Bills
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border transition-colors ${
              tab === "history"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            Sales History
          </button>
        </div>

        {/* Waiter filter chips — active tab only */}
        {tab === "active" && waiterNames.length > 1 && (
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto">
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

      <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-36 w-full bg-card rounded-xl" />
            ))}
          </div>
        ) : tab === "active" ? (
          /* ── ACTIVE BILLS ── */
          activeCustomers.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center opacity-50 gap-4">
              <Receipt className="w-16 h-16 text-muted-foreground" />
              <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">No outstanding bills</p>
            </div>
          ) : (
            activeCustomers.map((customer) => (
              <div
                key={`${customer.waitressName}|||${customer.customerName}`}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Customer header */}
                <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-black uppercase tracking-tight truncate">{customer.customerName}</h2>
                    <div className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${customer.overallStatus === "pending" ? "text-yellow-500" : "text-green-500"}`}>
                      {customer.overallStatus === "pending"
                        ? <><Hourglass className="w-3 h-3" /><span className="uppercase tracking-wide">Being prepared</span></>
                        : <><CheckCircle2 className="w-3 h-3" /><span className="uppercase tracking-wide">Drinks served</span></>
                      }
                    </div>
                    <p className="text-xs text-amber-400/80 font-semibold mt-1 uppercase tracking-wide">
                      by {customer.waitressName}
                    </p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <p className="text-2xl font-black text-primary">{formatPrice(customer.total)}</p>
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(customer.firstOrderAt), "h:mm a")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => printBill(customer)}
                        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/50 rounded-lg px-2.5 py-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print
                      </button>
                    </div>
                  </div>
                </div>

                {/* Rounds */}
                {customer.rounds.map((round, idx) => (
                  <div key={round.id} className={idx > 0 ? "border-t border-border/50" : ""}>
                    <div className="px-4 pt-2.5 pb-1 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
                        Round {idx + 1}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {format(new Date(round.createdAt), "h:mm a")}
                      </span>
                    </div>
                    <div className="px-4 pb-2.5 space-y-1.5">
                      {round.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-foreground font-medium flex-1 min-w-0 truncate">
                            <span className="text-muted-foreground font-bold mr-1">{item.quantity}×</span>
                            {item.menuItemName}
                          </span>
                          <span className="text-muted-foreground/60 text-xs tabular-nums shrink-0">
                            @{formatPrice(item.pricePence)}
                          </span>
                          <span className="text-foreground font-bold tabular-nums shrink-0 w-16 text-right">
                            {formatPrice(item.pricePence * item.quantity)}
                          </span>
                        </div>
                      ))}
                      {customer.rounds.length > 1 && (
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                          <span className="text-muted-foreground/60 uppercase tracking-wide font-bold">Subtotal</span>
                          <span className="text-muted-foreground font-bold tabular-nums">{formatPrice(round.subtotal)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Mark Paid — admin or bartender */}
                {(isAdmin || isBartender) && customer.overallStatus === "completed" && (
                  <div className="px-4 pb-4 pt-1 border-t border-border/50">
                    <Button
                      size="sm"
                      className="w-full gap-2 bg-green-700 hover:bg-green-600 text-white font-black uppercase tracking-widest"
                      onClick={() => handleMarkPaid(customer)}
                      disabled={payBatch.isPending}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {isAdmin ? "Mark Paid — Admin Clear" : "Mark Paid"}
                    </Button>
                  </div>
                )}
              </div>
            ))
          )
        ) : (
          /* ── SALES HISTORY ── */
          historyCustomers.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center opacity-50 gap-4">
              <TrendingUp className="w-16 h-16 text-muted-foreground" />
              <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">No sales yet today</p>
            </div>
          ) : (
            historyCustomers.map((customer) => (
              <div
                key={`history|||${customer.waitressName}|||${customer.customerName}|||${customer.firstOrderAt}`}
                className="bg-card/60 border border-border/60 rounded-xl overflow-hidden opacity-80"
              >
                <div className="px-4 py-3 border-b border-border/40 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-black uppercase tracking-tight truncate">{customer.customerName}</h2>
                    <div className="flex items-center gap-1 text-xs font-bold mt-0.5 text-green-500">
                      <Banknote className="w-3 h-3" />
                      <span className="uppercase tracking-wide">Paid</span>
                    </div>
                    <p className="text-xs text-amber-400/70 font-semibold mt-1 uppercase tracking-wide">
                      by {customer.waitressName}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-primary/80">{formatPrice(customer.total)}</p>
                    <p className="text-xs text-muted-foreground/60 flex items-center justify-end gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(customer.firstOrderAt), "h:mm a")}
                    </p>
                  </div>
                </div>
                <div className="px-4 py-2.5 space-y-1.5">
                  {customer.rounds.flatMap((r) => r.items).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground/80">
                      <span className="flex-1 min-w-0 truncate">
                        <span className="font-bold mr-1">{item.quantity}×</span>
                        {item.menuItemName}
                      </span>
                      <span className="text-xs tabular-nums shrink-0 text-muted-foreground/50">
                        @{formatPrice(item.pricePence)}
                      </span>
                      <span className="font-bold tabular-nums shrink-0 w-16 text-right">
                        {formatPrice(item.pricePence * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )
        )}
      </main>

      {/* Footer totals */}
      {tab === "active" && activeCustomers.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Outstanding</p>
              <p className="text-sm text-muted-foreground">
                {activeCustomers.length} customer{activeCustomers.length !== 1 ? "s" : ""}
              </p>
            </div>
            <p className="text-4xl font-black text-primary">{formatPrice(grandTotal)}</p>
          </div>
        </div>
      )}
      {tab === "history" && historyCustomers.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Sales</p>
              <p className="text-sm text-muted-foreground">
                {historyCustomers.length} paid bill{historyCustomers.length !== 1 ? "s" : ""}
              </p>
            </div>
            <p className="text-4xl font-black text-green-500">{formatPrice(totalSales)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
