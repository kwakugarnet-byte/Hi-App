import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { 
  useGetOrderBatches, 
  useCompleteOrderBatch,
  getGetOrderBatchesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

export default function Bar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: batches, isLoading } = useGetOrderBatches({
    query: { 
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 5000, // Poll every 5 seconds
    }
  });

  const completeBatch = useCompleteOrderBatch();

  const pendingBatches = useMemo(() => {
    if (!batches) return [];
    return batches.filter(b => b.status === "pending").sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [batches]);

  const handleComplete = (id: number) => {
    completeBatch.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
        toast({
          title: "Order Completed",
          description: "Marked order as done.",
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Could not mark order as completed.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b border-border p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-6 h-6" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-widest text-primary leading-none">Bar Display</h1>
            <p className="text-sm font-bold text-muted-foreground tracking-widest uppercase mt-1">
              {pendingBatches.length} Pending
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-x-auto">
        {isLoading && !batches ? (
          <div className="flex gap-6 items-start">
            <Skeleton className="w-80 h-96 shrink-0 bg-card rounded-xl" />
            <Skeleton className="w-80 h-96 shrink-0 bg-card rounded-xl" />
            <Skeleton className="w-80 h-96 shrink-0 bg-card rounded-xl" />
          </div>
        ) : pendingBatches.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-50">
            <CheckCircle2 className="w-24 h-24 mb-6 text-muted-foreground" />
            <h2 className="text-3xl font-black tracking-wider uppercase text-muted-foreground">All Clear</h2>
            <p className="text-lg mt-2 text-muted-foreground font-medium">Waiting for new orders...</p>
          </div>
        ) : (
          <div className="flex gap-6 items-start pb-6">
            {pendingBatches.map((batch) => (
              <Card key={batch.id} className="w-80 shrink-0 bg-card border-border shadow-xl flex flex-col overflow-hidden rounded-xl border-t-4 border-t-primary">
                <CardContent className="p-0 flex flex-col h-full">
                  <div className="p-5 border-b border-border bg-secondary/50">
                    <h2 className="text-3xl font-black uppercase tracking-tight text-foreground truncate" title={batch.customerName}>
                      {batch.customerName}
                    </h2>
                    <div className="flex items-center gap-2 mt-2 text-muted-foreground font-bold tracking-wide text-sm">
                      <span className="uppercase">{batch.waitressName}</span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {format(new Date(batch.createdAt), "h:mm a")}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-5 flex-1 space-y-4 bg-card">
                    {batch.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                        <span className="text-xl font-bold tracking-tight">{item.menuItemName}</span>
                        <span className="text-2xl font-black text-primary px-3 py-1 bg-primary/10 rounded-md">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-5 pt-0 mt-auto">
                    <Button 
                      size="lg" 
                      className="w-full h-16 text-xl font-black uppercase tracking-widest active:scale-[0.98] transition-transform"
                      onClick={() => handleComplete(batch.id)}
                      disabled={completeBatch.isPending}
                    >
                      {completeBatch.isPending ? "Processing..." : "Done"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
