import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Clock, CheckCircle2, Hourglass, Receipt } from "lucide-react";
import { useGetOrderBatches, getGetOrderBatchesQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

function formatPrice(pence: number) {
  return `R${(pence / 100).toFixed(2)}`;
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

export default function Bills() {
  const { user } = useAuth();
  const waitressName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : "";

  const { data: batches, isLoading } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 10000,
    },
  });

  const myOutstanding = useMemo(() => {
    if (!batches || !waitressName) return [];
    return batches
      .filter((b) => b.waitressName === waitressName && b.status !== "paid")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [batches, waitressName]);

  const grandTotal = useMemo(
    () => myOutstanding.reduce((sum, b) => sum + batchTotal(b.items), 0),
    [myOutstanding]
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <Link href="/">
          <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary">Outstanding Bills</h1>
          <p className="text-xs text-muted-foreground">{waitressName}</p>
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
        ) : myOutstanding.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center opacity-50 gap-4">
            <Receipt className="w-16 h-16 text-muted-foreground" />
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">No outstanding bills</p>
          </div>
        ) : (
          myOutstanding.map((batch) => {
            const total = batchTotal(batch.items);
            const status = STATUS_LABEL[batch.status] ?? STATUS_LABEL.pending;
            return (
              <div
                key={batch.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Customer header */}
                <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">{batch.customerName}</h2>
                    <div className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${status.color}`}>
                      {status.icon}
                      <span className="uppercase tracking-wide">{status.label}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black text-primary">{formatPrice(total)}</p>
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {format(new Date(batch.createdAt), "h:mm a")}
                    </p>
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
      {myOutstanding.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Total Outstanding</p>
              <p className="text-sm text-muted-foreground">{myOutstanding.length} table{myOutstanding.length !== 1 ? "s" : ""}</p>
            </div>
            <p className="text-4xl font-black text-primary">{formatPrice(grandTotal)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
