import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Clock, CheckCircle2, Hourglass, Receipt, Printer } from "lucide-react";
import { useGetOrderBatches, getGetOrderBatchesQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

function batchTotal(items: { pricePence: number; quantity: number }[]) {
  return items.reduce((sum, i) => sum + i.pricePence * i.quantity, 0);
}

const STATUS_LABEL: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: {
    label: "Being prepared",
    icon: <Hourglass className="w-3 h-3" />,
    color: "text-yellow-500",
  },
  completed: {
    label: "Drinks served",
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: "text-green-500",
  },
};

type Batch = {
  id: number;
  customerName: string;
  waitressName: string;
  status: string;
  createdAt: string;
  items: { menuItemName: string; menuItemId: number; quantity: number; pricePence: number }[];
};

function printBill(batch: Batch) {
  const total = batchTotal(batch.items);
  const rows = batch.items
    .map(
      (item) => `
      <tr>
        <td>${item.quantity}&times;</td>
        <td>${item.menuItemName}</td>
        <td class="price">${formatPrice(item.pricePence * item.quantity)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt — ${batch.customerName}</title>
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
    td { padding: 3px 2px; vertical-align: top; }
    td:first-child { width: 28px; }
    td.price { text-align: right; white-space: nowrap; }
    .total-row { border-top: 1px solid #000; margin-top: 8px; padding-top: 8px; display: flex; justify-content: space-between; align-items: baseline; }
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
  <div class="customer">${batch.customerName}</div>
  <div class="meta">Served by: ${batch.waitressName}</div>
  <div class="meta">Time: ${format(new Date(batch.createdAt), "dd MMM yyyy, h:mm a")}</div>
  <div class="divider"></div>
  <table>
    ${rows}
  </table>
  <div class="divider"></div>
  <div class="total-row">
    <span class="total-label">Total</span>
    <span class="total-amount">${formatPrice(total)}</span>
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
  const { user, role, isWaitress } = useAuth();

  const waitressName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : "";

  const { data: batches, isLoading } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 10000,
    },
  });

  const outstanding = useMemo(() => {
    if (!batches) return [];
    const unpaid = batches.filter((b) => b.status !== "paid");
    if (isWaitress && waitressName) {
      return unpaid
        .filter((b) => b.waitressName === waitressName)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    return unpaid.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [batches, waitressName, isWaitress]);

  const grandTotal = useMemo(
    () => outstanding.reduce((sum, b) => sum + batchTotal(b.items), 0),
    [outstanding]
  );

  const pageTitle = isWaitress ? "My Outstanding Bills" : "All Active Bills";
  const subtitle = isWaitress ? waitressName : `${outstanding.length} active table${outstanding.length !== 1 ? "s" : ""}`;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <Link href="/">
          <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">{pageTitle}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="w-10" />
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-36 w-full bg-card rounded-xl" />
            ))}
          </div>
        ) : outstanding.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center opacity-50 gap-4">
            <Receipt className="w-16 h-16 text-muted-foreground" />
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">No outstanding bills</p>
          </div>
        ) : (
          outstanding.map((batch) => {
            const total = batchTotal(batch.items);
            const status = STATUS_LABEL[batch.status] ?? STATUS_LABEL.pending;
            return (
              <div
                key={batch.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Customer header */}
                <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-black uppercase tracking-tight truncate">{batch.customerName}</h2>
                    <div className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${status.color}`}>
                      {status.icon}
                      <span className="uppercase tracking-wide">{status.label}</span>
                    </div>
                    {!isWaitress && (
                      <p className="text-xs text-amber-400/80 font-semibold mt-1 uppercase tracking-wide">
                        by {batch.waitressName}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    <p className="text-2xl font-black text-primary">{formatPrice(total)}</p>
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(batch.createdAt), "h:mm a")}
                    </p>
                    <button
                      onClick={() => printBill(batch as Batch)}
                      className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-primary transition-colors border border-border hover:border-primary/50 rounded-lg px-2.5 py-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print
                    </button>
                  </div>
                </div>

                {/* Items */}
                <div className="px-4 py-3 space-y-2">
                  {batch.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-medium">
                        <span className="text-muted-foreground font-bold mr-2">{item.quantity}×</span>
                        {item.menuItemName}
                      </span>
                      <span className="text-muted-foreground font-semibold tabular-nums">
                        {formatPrice(item.pricePence * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Grand total footer */}
      {outstanding.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {isWaitress ? "Total Outstanding" : "All Active Bills"}
              </p>
              <p className="text-sm text-muted-foreground">
                {outstanding.length} table{outstanding.length !== 1 ? "s" : ""}
              </p>
            </div>
            <p className="text-4xl font-black text-primary">{formatPrice(grandTotal)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
