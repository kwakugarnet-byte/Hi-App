import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Clock, CheckCircle2, Hourglass, Receipt, Printer, Banknote, TrendingUp, ShieldCheck, Users, AlertTriangle, CircleDashed, ChevronRight, Eye, X, CreditCard, Pencil, Plus, Minus, Trash2, RotateCcw, Sparkles } from "lucide-react";
import {
  useGetOrderBatches,
  useGetMenuItems,
  getGetOrderBatchesQueryKey,
  getGetMenuItemsQueryKey,
  getGetShiftsQueryKey,
  getGetStaffQueryKey,
  usePayOrderBatch,
  useSettleWaiterAccount,
  useEditOrderBatch,
  useReturnOrderBatch,
  useGetShifts,
  useGetStaff,
  useClearStaffBonus,
  useRecordPartialPayment,
  useGetPartialPayments,
  getPartialPaymentsQueryKey,
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

type BatchItem = { id: number; menuItemName: string; menuItemId: number; quantity: number; pricePence: number };

type Round = {
  id: number;
  status: string;
  createdAt: string;
  items: BatchItem[];
  subtotal: number;
  correctionItemIds: number[] | null;
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
  batches: { id: number; customerName: string; waitressName: string; status: string; createdAt: string; correctionItemIds?: number[] | null; items: BatchItem[] }[]
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

    if (batch.status === "pending" || batch.status === "returned") group.overallStatus = "pending";

    if (new Date(batch.createdAt) < new Date(group.firstOrderAt)) {
      group.firstOrderAt = batch.createdAt;
    }

    const subtotal = batch.items.reduce((s, i) => s + i.pricePence * i.quantity, 0);
    group.rounds.push({ id: batch.id, status: batch.status, createdAt: batch.createdAt, items: batch.items, subtotal, correctionItemIds: batch.correctionItemIds ?? null });
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

type EditingRound = {
  batchId: number;
  customerName: string;
  items: Record<number, { menuItemId: number; menuItemName: string; quantity: number }>;
  activeTab: string | null;
};

export default function Bills() {
  const { user, isWaitress, isAdmin, isBartender } = useAuth();
  const [selectedWaiter, setSelectedWaiter] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [showBillFor, setShowBillFor] = useState<GroupedCustomer | null>(null);
  const [settleConfirm, setSettleConfirm] = useState<{ name: string; total: number; count: number } | null>(null);
  const [editingRound, setEditingRound] = useState<EditingRound | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Build the current user's display name (matches waitressName stored on batches)
  const myName = user
    ? `${user.firstName ?? ""}${user.lastName ? " " + user.lastName : ""}`.trim()
    : null;

  const { data: batches, isLoading } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 10000,
    },
  });

  const { data: menuItems } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey(), enabled: !!(isAdmin || isBartender) },
  });

  // Fetch today's shifts (admin sees all, others see own)
  const { data: shifts } = useGetShifts({
    query: { queryKey: getGetShiftsQueryKey(), refetchInterval: 30000, enabled: !!(isAdmin || isBartender) },
  });

  // Fetch staff list for bonus percentages
  const { data: staffList } = useGetStaff({
    query: { queryKey: getGetStaffQueryKey() },
  });

  // Map staff name → bonus percent
  const staffBonusMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of staffList ?? []) {
      if (s.bonusPercent && s.bonusPercent > 0) map.set(s.name, s.bonusPercent);
    }
    return map;
  }, [staffList]);

  // Set of staff names whose shift has ended today with NO active shift — their bills are admin-only to clear
  const endedStaffNames = useMemo(() => {
    if (!shifts) return new Set<string>();
    const activeNames = new Set(shifts.filter((s) => !s.endedAt).map((s) => s.staffName));
    const endedNames = new Set(shifts.filter((s) => s.endedAt).map((s) => s.staffName));
    // Only flag as ended if they have no currently-active shift
    return new Set([...endedNames].filter((name) => !activeNames.has(name)));
  }, [shifts]);

  const payBatch = usePayOrderBatch();
  const settleWaiter = useSettleWaiterAccount();
  const editBatch = useEditOrderBatch();
  const returnBatch = useReturnOrderBatch();
  const clearBonus = useClearStaffBonus();
  const recordPartialPayment = useRecordPartialPayment();
  const { data: allPartialPayments } = useGetPartialPayments();

  const [bonusClearConfirm, setBonusClearConfirm] = useState<number | null>(null);
  const [bonusDeduction, setBonusDeduction] = useState("");
  const [salesRange, setSalesRange] = useState<"7d" | "30d" | "90d" | "1y" | "custom">("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [returnModal, setReturnModal] = useState<{ round: Round; customerName: string; waitressName: string } | null>(null);
  const [returnQtys, setReturnQtys] = useState<Map<number, number>>(new Map());
  const [partialPayFor, setPartialPayFor] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");

  function openReturnModal(round: Round, customerName: string, waitressName: string) {
    setReturnQtys(new Map());
    setReturnModal({ round, customerName, waitressName });
  }

  function toggleReturnItem(id: number) {
    setReturnQtys((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  }

  function adjustReturnQty(id: number, delta: number, maxQty: number) {
    setReturnQtys((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? 1;
      const newQty = Math.max(1, Math.min(maxQty, current + delta));
      next.set(id, newQty);
      return next;
    });
  }

  async function confirmReturn() {
    if (!returnModal) return;
    const correctionItemIds: number[] = [];
    for (const [id, qty] of returnQtys) {
      for (let i = 0; i < qty; i++) correctionItemIds.push(id);
    }
    try {
      await returnBatch.mutateAsync({ id: returnModal.round.id, data: { correctionItemIds } });
      await queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
      toast({ title: "Returned to Waitress", description: `Order sent back to ${returnModal.waitressName} for correction.` });
      setReturnModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to return order", description: msg, variant: "destructive" });
    }
  }

  const editCategories = useMemo(() => {
    if (!menuItems) return [];
    return Array.from(new Set(menuItems.map((i) => i.category)));
  }, [menuItems]);

  const editCurrentTab = editingRound?.activeTab ?? editCategories[0] ?? null;

  const editItemsInTab = useMemo(() => {
    if (!menuItems || !editCurrentTab) return [];
    return menuItems.filter((i) => i.category === editCurrentTab);
  }, [menuItems, editCurrentTab]);

  function startEditRound(round: Round, customerName: string) {
    const itemMap: Record<number, { menuItemId: number; menuItemName: string; quantity: number }> = {};
    for (const item of round.items) {
      itemMap[item.menuItemId] = { menuItemId: item.menuItemId, menuItemName: item.menuItemName, quantity: item.quantity };
    }
    setEditingRound({ batchId: round.id, customerName, items: itemMap, activeTab: null });
  }

  function editChangeQty(id: number, name: string, delta: number) {
    setEditingRound((prev) => {
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

  function handleSaveEdit() {
    if (!editingRound) return;
    const items = Object.values(editingRound.items).map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity }));
    if (items.length === 0) {
      toast({ title: "No items", description: "Add at least one drink.", variant: "destructive" });
      return;
    }
    editBatch.mutate(
      { id: editingRound.batchId, data: { items } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
          toast({ title: "Bill Updated", description: `${editingRound.customerName}'s order has been updated.` });
          setEditingRound(null);
        },
        onError: () => {
          toast({ title: "Failed to update bill", variant: "destructive" });
        },
      }
    );
  }

  const handleSettleConfirmed = () => {
    if (!settleConfirm) return;
    settleWaiter.mutate({ waitressName: settleConfirm.name }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetOrderBatchesQueryKey() });
        setSettleConfirm(null);
        toast({
          title: "Account settled",
          description: `${result.count} bill${result.count === 1 ? "" : "s"} cleared — ${formatPrice(result.totalPence)} collected from ${result.waitressName}`,
        });
      },
      onError: () => {
        toast({ title: "Failed to settle account", variant: "destructive" });
      },
    });
  };

  const waiterNames = useMemo(() => {
    if (!batches) return [];
    return [...new Set(batches.map((b) => b.waitressName))].sort();
  }, [batches]);

  const historyWaiterNames = useMemo(() => {
    if (!batches) return [];
    return [...new Set(batches.filter((b) => b.status === "paid").map((b) => b.waitressName))].sort();
  }, [batches]);

  const activeCustomers = useMemo(() => {
    if (!batches) return [];
    const unpaid = batches.filter((b) => {
      if (b.status === "paid") return false;
      if (isWaitress && myName) return b.waitressName === myName;
      return !selectedWaiter || b.waitressName === selectedWaiter;
    });
    return groupBatches(unpaid);
  }, [batches, selectedWaiter, isWaitress, myName]);

  const historyCustomers = useMemo(() => {
    if (!batches) return [];
    const paid = batches.filter((b) => {
      if (b.status !== "paid") return false;
      if (isWaitress && myName) return b.waitressName === myName;
      return !selectedWaiter || b.waitressName === selectedWaiter;
    });
    return groupBatches(paid).reverse();
  }, [batches, selectedWaiter, isWaitress, myName]);

  const grandTotal = useMemo(
    () => activeCustomers.reduce((sum, c) => sum + c.total, 0),
    [activeCustomers]
  );

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const isOlderThan24Hours = (dateStr: string) =>
    Date.now() - new Date(dateStr).getTime() > TWENTY_FOUR_HOURS_MS;

  // Date-range filtered history
  const filteredHistoryCustomers = useMemo(() => {
    if (salesRange === "custom") {
      const start = customStart ? new Date(customStart + "T00:00:00") : null;
      const end   = customEnd   ? new Date(customEnd   + "T23:59:59") : null;
      if (!start && !end) return historyCustomers;
      return historyCustomers.filter((c) => {
        const d = new Date(c.firstOrderAt);
        if (start && d < start) return false;
        if (end   && d > end)   return false;
        return true;
      });
    }
    const days = salesRange === "7d" ? 7 : salesRange === "30d" ? 30 : salesRange === "90d" ? 90 : 365;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return historyCustomers.filter((c) => new Date(c.firstOrderAt) >= cutoff);
  }, [historyCustomers, isAdmin, salesRange, customStart, customEnd]);

  const totalSales = useMemo(
    () => filteredHistoryCustomers.reduce((sum, c) => sum + c.total, 0),
    [filteredHistoryCustomers]
  );

  // Credit owed per waiter — derived from already-filtered activeCustomers
  const waiterCredits = useMemo(() => {
    const map = new Map<string, { name: string; customers: number; total: number }>();
    for (const c of activeCustomers) {
      if (!map.has(c.waitressName)) map.set(c.waitressName, { name: c.waitressName, customers: 0, total: 0 });
      const entry = map.get(c.waitressName)!;
      entry.customers += 1;
      entry.total += c.total;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [activeCustomers]);

  // Sales per waiter from history (paid bills — filtered range)
  const waiterSales = useMemo(() => {
    const map = new Map<string, { name: string; customers: number; total: number }>();
    for (const c of filteredHistoryCustomers) {
      if (!map.has(c.waitressName)) map.set(c.waitressName, { name: c.waitressName, customers: 0, total: 0 });
      const entry = map.get(c.waitressName)!;
      entry.customers += 1;
      entry.total += c.total;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filteredHistoryCustomers]);

  // Bonus owed per waiter — paid batches since last bonus clearing × bonusPercent
  const bonusSummary = useMemo(() => {
    if (!batches || !staffList) return [];
    const eligible = staffList.filter((s) => (s.bonusPercent ?? 0) > 0);
    if (eligible.length === 0) return [];
    const salesSince = new Map<string, number>();
    for (const b of batches) {
      if (b.status !== "paid") continue;
      const staff = eligible.find((s) => s.name === b.waitressName);
      if (!staff) continue;
      if (staff.bonusLastPaidAt && new Date(b.createdAt) <= new Date(staff.bonusLastPaidAt)) continue;
      const batchTotal = b.items.reduce((s, i) => s + i.pricePence * i.quantity, 0);
      salesSince.set(b.waitressName, (salesSince.get(b.waitressName) ?? 0) + batchTotal);
    }
    return eligible
      .map((s) => ({
        id: s.id,
        name: s.name,
        bonusPercent: s.bonusPercent!,
        salesTotal: salesSince.get(s.name) ?? 0,
        bonusOwed: Math.round((salesSince.get(s.name) ?? 0) * (s.bonusPercent!) / 100),
        lastClearedAt: s.bonusLastPaidAt ?? null,
      }))
      .sort((a, b) => b.bonusOwed - a.bonusOwed);
  }, [batches, staffList]);

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

  const handlePartialPay = async (customer: GroupedCustomer) => {
    const amountCedis = parseFloat(partialAmount);
    if (!partialAmount || isNaN(amountCedis) || amountCedis <= 0) return;
    const amountPence = Math.round(amountCedis * 100);
    try {
      await recordPartialPayment.mutateAsync({
        customerName: customer.customerName,
        waitressName: customer.waitressName,
        amountPence,
      });
      await queryClient.invalidateQueries({ queryKey: getPartialPaymentsQueryKey() });
      toast({ title: "Partial Payment Recorded", description: `₵${amountCedis.toFixed(2)} recorded for ${customer.customerName}. Remaining balance updated.` });
      setPartialPayFor(null);
      setPartialAmount("");
    } catch {
      toast({ title: "Error", description: "Could not record partial payment.", variant: "destructive" });
    }
  };

  const activeSubtitle = isWaitress
    ? `Your outstanding credit`
    : selectedWaiter
      ? `${activeCustomers.length} customer${activeCustomers.length !== 1 ? "s" : ""} — ${selectedWaiter}`
      : `${activeCustomers.length} active customer${activeCustomers.length !== 1 ? "s" : ""}`;

  const activeContent = activeCustomers.length === 0
    ? (
      <div className="h-64 flex flex-col items-center justify-center opacity-50 gap-4">
        <Receipt className="w-16 h-16 text-muted-foreground" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">
          {isWaitress ? "No outstanding bills — you're clear!" : "No outstanding bills"}
        </p>
      </div>
    ) : (
      <>
        {/* Waitress accountability banner */}
        {isWaitress && grandTotal > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-amber-400">Your Outstanding Credit</p>
              <p className="text-xs text-muted-foreground mt-0.5">You are responsible for collecting these bills</p>
            </div>
            <span className="text-2xl font-black text-amber-400 tabular-nums shrink-0">{formatPrice(grandTotal)}</span>
          </div>
        )}

        {/* Collect From — quick-glance list for waitress */}
        {isWaitress && activeCustomers.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Collect From</span>
            </div>
            <div className="divide-y divide-border/50">
              {activeCustomers
                .sort((a, b) => {
                  // Ready-to-collect first
                  if (a.overallStatus === "completed" && b.overallStatus !== "completed") return -1;
                  if (a.overallStatus !== "completed" && b.overallStatus === "completed") return 1;
                  return 0;
                })
                .map((c) => {
                  const ready = c.overallStatus === "completed";
                  return (
                    <div key={c.customerName} className={`px-4 py-3 flex items-center gap-3 ${ready ? "" : "opacity-50"}`}>
                      {ready
                        ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        : <CircleDashed className="w-5 h-5 text-muted-foreground shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-black uppercase tracking-tight truncate">{c.customerName}</p>
                        <p className={`text-xs font-bold mt-0.5 ${ready ? "text-green-500" : "text-yellow-500"}`}>
                          {ready ? "Drinks served — collect now" : "Still being prepared"}
                        </p>
                      </div>
                      <span className={`text-lg font-black tabular-nums shrink-0 ${ready ? "text-primary" : "text-muted-foreground"}`}>
                        {formatPrice(c.total)}
                      </span>
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}
        {/* Credit by Waiter — admin/bartender only */}
        {!isWaitress && waiterCredits.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Credit by Waiter</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-bold">Tap to settle</span>
            </div>
            <div className="divide-y divide-border/50">
              {waiterCredits.map((w) => (
                <div key={w.name}>
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold uppercase tracking-wide truncate">{w.name}</span>
                      <span className="text-[10px] text-muted-foreground font-bold bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                        {w.customers} {w.customers === 1 ? "customer" : "customers"}
                      </span>
                      {endedStaffNames.has(w.name) && (
                        <span className="text-[10px] font-black uppercase tracking-wide text-orange-400 bg-orange-500/10 border border-orange-500/30 px-1.5 py-0.5 rounded-full shrink-0">Day ended</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="text-lg font-black text-amber-400 tabular-nums">{formatPrice(w.total)}</div>
                        {staffBonusMap.has(w.name) && (
                          <div className="text-[11px] font-bold text-emerald-400 tabular-nums">
                            +{formatPrice(Math.round(w.total * staffBonusMap.get(w.name)! / 100))} bonus ({staffBonusMap.get(w.name)}%)
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() =>
                            settleConfirm?.name === w.name
                              ? setSettleConfirm(null)
                              : setSettleConfirm({ name: w.name, total: w.total, count: w.customers })
                          }
                          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors"
                        >
                          <CreditCard className="w-3 h-3" />
                          Settle
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Inline confirm panel */}
                  {settleConfirm?.name === w.name && (
                    <div className="px-4 py-3 bg-green-500/5 border-t border-green-500/20 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-green-400 uppercase tracking-wide">
                          Settle {w.name}'s account?
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {w.customers} outstanding bill{w.customers === 1 ? "" : "s"} · {formatPrice(w.total)} total will be marked paid
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setSettleConfirm(null)}
                          className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wide px-2 py-1 rounded-lg border border-border hover:border-muted-foreground/50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSettleConfirmed}
                          disabled={settleWaiter.isPending}
                          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {settleWaiter.isPending ? "Settling…" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BONUS OWED — admin only, shown when staff have bonus rates ── */}
        {isAdmin && bonusSummary.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Bonus Owed</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-bold">From paid sales</span>
            </div>
            <div className="divide-y divide-border/50">
              {bonusSummary.map((w) => (
                <div key={w.id}>
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold uppercase tracking-wide truncate">{w.name}</span>
                      <span className="text-[10px] text-muted-foreground font-bold bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                        {w.bonusPercent}% of {formatPrice(w.salesTotal)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className={`text-lg font-black tabular-nums ${w.bonusOwed > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                          {formatPrice(w.bonusOwed)}
                        </div>
                        {w.lastClearedAt && (
                          <div className="text-[10px] text-muted-foreground">
                            since {format(new Date(w.lastClearedAt), "d MMM, h:mm a")}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (bonusClearConfirm === w.id) {
                            setBonusClearConfirm(null);
                            setBonusDeduction("");
                          } else {
                            setBonusClearConfirm(w.id);
                            setBonusDeduction("");
                          }
                        }}
                        disabled={w.bonusOwed === 0}
                        className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Mark Paid
                      </button>
                    </div>
                  </div>
                  {/* Inline confirm panel */}
                  {bonusClearConfirm === w.id && (() => {
                    const deductPence = Math.max(0, Math.round(parseFloat(bonusDeduction || "0") * 100));
                    const netPayout = Math.max(0, w.bonusOwed - deductPence);
                    const hasDeduction = deductPence > 0;
                    return (
                      <div className="px-4 py-3 bg-emerald-500/5 border-t border-emerald-500/20 space-y-3">
                        {/* Deduction input row */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground block mb-1">
                              Losses / Deduction (₵)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={bonusDeduction}
                              onChange={(e) => setBonusDeduction(e.target.value)}
                              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                            />
                          </div>
                          {/* Payout breakdown */}
                          <div className="text-right shrink-0">
                            {hasDeduction ? (
                              <>
                                <div className="text-[10px] text-muted-foreground line-through tabular-nums">{formatPrice(w.bonusOwed)}</div>
                                <div className="text-[10px] text-red-400 font-bold tabular-nums">− {formatPrice(deductPence)}</div>
                                <div className="text-base font-black text-emerald-400 tabular-nums">{formatPrice(netPayout)}</div>
                                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">net payout</div>
                              </>
                            ) : (
                              <>
                                <div className="text-base font-black text-emerald-400 tabular-nums">{formatPrice(w.bonusOwed)}</div>
                                <div className="text-[9px] text-muted-foreground uppercase tracking-wide">payout</div>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Confirm / cancel */}
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] text-muted-foreground">
                            {hasDeduction
                              ? `${formatPrice(deductPence)} deducted for losses — ${formatPrice(netPayout)} paid to ${w.name}. Accumulation resets from now.`
                              : `${formatPrice(w.bonusOwed)} will be recorded as paid. Accumulation resets from now.`}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => { setBonusClearConfirm(null); setBonusDeduction(""); }}
                              className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wide px-2 py-1 rounded-lg border border-border hover:border-muted-foreground/50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await clearBonus.mutateAsync({ id: w.id });
                                  await queryClient.invalidateQueries({ queryKey: getGetStaffQueryKey() });
                                  setBonusClearConfirm(null);
                                  setBonusDeduction("");
                                  toast({
                                    title: `${w.name}'s bonus marked as paid`,
                                    description: hasDeduction
                                      ? `${formatPrice(netPayout)} paid out (${formatPrice(deductPence)} deducted for losses).`
                                      : `${formatPrice(w.bonusOwed)} recorded.`,
                                  });
                                } catch {
                                  toast({ title: "Failed to clear bonus", variant: "destructive" });
                                }
                              }}
                              disabled={clearBonus.isPending}
                              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {clearBonus.isPending ? "Saving…" : "Confirm"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeCustomers.map((customer) => (
          <div key={`${customer.waitressName}|||${customer.customerName}|||${customer.firstOrderAt}`} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black uppercase tracking-tight truncate">{customer.customerName}</h2>
                <div className={`flex items-center gap-1 text-xs font-bold mt-0.5 ${customer.overallStatus === "pending" ? "text-yellow-500" : "text-green-500"}`}>
                  {customer.overallStatus === "pending"
                    ? <><Hourglass className="w-3 h-3" /><span className="uppercase tracking-wide">Being prepared</span></>
                    : <><CheckCircle2 className="w-3 h-3" /><span className="uppercase tracking-wide">Drinks served</span></>
                  }
                </div>
                <p className="text-xs text-amber-400/80 font-semibold mt-1 uppercase tracking-wide">by {customer.waitressName}</p>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-2">
                <p className="text-2xl font-black text-primary">{formatPrice(customer.total)}</p>
                <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(customer.firstOrderAt), "d MMM · h:mm a")}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBillFor(customer)}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary border border-primary/50 hover:bg-primary/10 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Show
                  </button>
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
            {customer.rounds.map((round, idx) => (
              <div key={round.id} className={idx > 0 ? "border-t border-border/50" : ""}>
                <div className="px-4 pt-2.5 pb-1 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Round {idx + 1}</span>
                  <div className="flex items-center gap-3">
                    {(isAdmin || isBartender) && round.status !== "returned" && (
                      <>
                        <button
                          onClick={() => startEditRound(round, customer.customerName)}
                          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          Edit
                        </button>
                      </>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {format(new Date(round.createdAt), "h:mm a")}
                    </span>
                  </div>
                </div>
                <div className="px-4 pb-2.5 space-y-1.5">
                  {round.items.map((item, i) => {
                    const isFlagged = round.status === "returned" && !!round.correctionItemIds?.includes(item.id);
                    return (
                    <div key={i} className={`flex items-center gap-2 text-sm ${isFlagged ? "rounded-lg bg-orange-500/10 px-2 py-0.5 -mx-2" : ""}`}>
                      <span className={`font-medium flex-1 min-w-0 truncate ${isFlagged ? "text-orange-300" : "text-foreground"}`}>
                        <span className={`font-bold mr-1 ${isFlagged ? "text-orange-400" : "text-muted-foreground"}`}>{item.quantity}×</span>
                        {item.menuItemName}
                      </span>
                      {isFlagged && <RotateCcw className="w-3 h-3 text-orange-400 shrink-0" />}
                      {!isWaitress && <span className="text-muted-foreground/60 text-xs tabular-nums shrink-0">@{formatPrice(item.pricePence)}</span>}
                      {!isWaitress && <span className="text-foreground font-bold tabular-nums shrink-0 w-16 text-right">{formatPrice(item.pricePence * item.quantity)}</span>}
                    </div>
                    );
                  })}
                  {customer.rounds.length > 1 && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                      <span className="text-muted-foreground/60 uppercase tracking-wide font-bold">Subtotal</span>
                      <span className="text-muted-foreground font-bold tabular-nums">{formatPrice(round.subtotal)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(customer.overallStatus === "completed" || (isAdmin && customer.rounds.every(r => r.status === "completed" || r.status === "returned"))) && (isAdmin || isBartender) && (() => {
              const isOld = isOlderThan24Hours(customer.firstOrderAt);
              const customerKey = `${customer.waitressName}|||${customer.customerName}`;

              // Bartender + old bill → locked
              if (isBartender && isOld) {
                return (
                  <div className="px-4 pb-4 pt-1 border-t border-border/50">
                    <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border/50 text-muted-foreground/50 text-xs font-black uppercase tracking-widest cursor-not-allowed">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Admin Clearance Required
                    </div>
                  </div>
                );
              }

              // Admin + old bill → Full or Partial payment choice
              if (isAdmin && isOld) {
                const isExpanded = partialPayFor === customerKey;
                const paymentsForCustomer = (allPartialPayments ?? []).filter(
                  (p) => p.customerName === customer.customerName && p.waitressName === customer.waitressName
                );
                const totalPaid = paymentsForCustomer.reduce((s, p) => s + p.amountPence, 0);
                const remaining = Math.max(0, customer.total - totalPaid);
                const amountCedis = parseFloat(partialAmount);
                const amountValid = !isNaN(amountCedis) && amountCedis > 0;
                return (
                  <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Admin Clearance — 24h+</p>
                    {totalPaid > 0 && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground font-bold">Total Bill</span>
                          <span className="font-black tabular-nums">{formatPrice(customer.total)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-green-400 font-bold">Paid so far</span>
                          <span className="text-green-400 font-black tabular-nums">−{formatPrice(totalPaid)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] border-t border-amber-500/20 pt-0.5 mt-0.5">
                          <span className="text-amber-400 font-black uppercase tracking-wide">Remaining</span>
                          <span className="text-amber-400 font-black tabular-nums">{formatPrice(remaining)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 bg-green-700 hover:bg-green-600 text-white font-black uppercase tracking-widest text-[11px]"
                        onClick={() => { setPartialPayFor(null); setPartialAmount(""); handleMarkPaid(customer); }}
                        disabled={payBatch.isPending}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Full Payment
                      </Button>
                      <button
                        onClick={() => {
                          if (isExpanded) { setPartialPayFor(null); setPartialAmount(""); }
                          else { setPartialPayFor(customerKey); setPartialAmount(""); }
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-md border transition-colors ${
                          isExpanded
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                            : "border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-400"
                        }`}
                      >
                        Partial
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="space-y-2 pt-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Amount customer is paying (₵):
                        </p>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={`e.g. ${((remaining || customer.total) / 100 / 2).toFixed(2)}`}
                          value={partialAmount}
                          onChange={(e) => setPartialAmount(e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        />
                        {amountValid && (
                          <div className="text-[11px] text-muted-foreground flex justify-between">
                            <span>Remaining after this:</span>
                            <span className="font-black text-amber-400 tabular-nums">
                              {formatPrice(Math.max(0, remaining - Math.round(amountCedis * 100)))}
                            </span>
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="w-full gap-2 bg-amber-600 hover:bg-amber-500 text-white font-black uppercase tracking-widest"
                          onClick={() => handlePartialPay(customer)}
                          disabled={!amountValid || recordPartialPayment.isPending}
                        >
                          {recordPartialPayment.isPending ? "Recording…" : `Record ₵${amountValid ? amountCedis.toFixed(2) : "0.00"} Payment`}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              }

              // Normal (within 24h) → simple Mark Paid
              return (
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
              );
            })()}
          </div>
        ))}
      </>
    );

  const RANGE_LABELS: Record<string, string> = { "7d": "7 Days", "30d": "Month", "90d": "90 Days", "1y": "Year", "custom": "Custom" };

  const historyContent = historyCustomers.length === 0
    ? (
      <div className="h-64 flex flex-col items-center justify-center opacity-50 gap-4">
        <TrendingUp className="w-16 h-16 text-muted-foreground" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">No sales yet</p>
      </div>
    ) : (
      <>
        {/* Date range filter bar */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2.5 flex items-center gap-1.5 flex-wrap">
            {(["7d", "30d", "90d", "1y", "custom"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setSalesRange(r)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all ${
                  salesRange === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
          {salesRange === "custom" && (
            <div className="px-3 pb-2.5 flex items-center gap-2 border-t border-border/50 pt-2">
              <div className="flex-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block mb-1">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block mb-1">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Grand total card — admin only */}
        {isAdmin && (
          <div className="bg-green-500/5 border border-green-500/30 rounded-xl px-4 py-3.5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-green-400">Total Sales</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {filteredHistoryCustomers.length} paid bill{filteredHistoryCustomers.length !== 1 ? "s" : ""} · {waiterSales.length} waiter{waiterSales.length !== 1 ? "s" : ""}
              </p>
            </div>
            <span className="text-3xl font-black text-green-400 tabular-nums">
              {formatPrice(totalSales)}
            </span>
          </div>
        )}

        {waiterSales.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Sales by Waiter</span>
            </div>
            <div className="divide-y divide-border/50">
              {waiterSales.map((w) => {
                const bonusPct = staffBonusMap.get(w.name);
                const bonusAmt = bonusPct ? Math.round(w.total * bonusPct / 100) : 0;
                return (
                  <div key={w.name} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold uppercase tracking-wide truncate">{w.name}</span>
                      <span className="text-[10px] text-muted-foreground font-bold bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                        {w.customers} {w.customers === 1 ? "sale" : "sales"}
                      </span>
                    </div>
                    {!isWaitress && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-black text-green-500 tabular-nums">{formatPrice(w.total)}</div>
                        {bonusPct && bonusPct > 0 && (
                          <div className="text-[11px] font-bold text-emerald-400 tabular-nums">
                            +{formatPrice(bonusAmt)} bonus ({bonusPct}%)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {filteredHistoryCustomers.length === 0 && (
          <div className="h-40 flex flex-col items-center justify-center opacity-50 gap-3">
            <TrendingUp className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">No sales in this period</p>
          </div>
        )}
        {filteredHistoryCustomers.map((customer) => (
          <div key={`history|||${customer.waitressName}|||${customer.customerName}|||${customer.firstOrderAt}`} className="bg-card/60 border border-border/60 rounded-xl overflow-hidden opacity-80">
            <div className="px-4 py-3 border-b border-border/40 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black uppercase tracking-tight truncate">{customer.customerName}</h2>
                <div className="flex items-center gap-1 text-xs font-bold mt-0.5 text-green-500">
                  <Banknote className="w-3 h-3" />
                  <span className="uppercase tracking-wide">Paid</span>
                </div>
                <p className="text-xs text-amber-400/70 font-semibold mt-1 uppercase tracking-wide">by {customer.waitressName}</p>
              </div>
              <div className="text-right shrink-0">
                {!isWaitress && <p className="text-xl font-black text-primary/80">{formatPrice(customer.total)}</p>}
                <p className="text-xs text-muted-foreground/60 flex items-center justify-end gap-1 mt-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(customer.firstOrderAt), "d MMM · h:mm a")}
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
                  {!isWaitress && <span className="text-xs tabular-nums shrink-0 text-muted-foreground/50">@{formatPrice(item.pricePence)}</span>}
                  {!isWaitress && <span className="font-bold tabular-nums shrink-0 w-16 text-right">{formatPrice(item.pricePence * item.quantity)}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </>
    );

  return (
    <div>
    {/* Edit Round Overlay — bartender/admin only */}
    {editingRound && menuItems && (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="sticky top-0 z-20 bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
          <button onClick={() => setEditingRound(null)} className="p-2 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h1 className="text-sm font-black uppercase tracking-wide text-primary">Edit Order</h1>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-wide">{editingRound.customerName}</p>
          </div>
          <div className="w-10" />
        </header>

        {/* Category tabs */}
        <div className="shrink-0 overflow-x-auto border-b border-border bg-card">
          <div className="flex gap-1 px-4 py-2 min-w-max">
            {editCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setEditingRound((prev) => prev ? { ...prev, activeTab: cat } : prev)}
                className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
                  editCurrentTab === cat
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
            {editItemsInTab.map((item) => {
              const qty = editingRound.items[item.id]?.quantity ?? 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => editChangeQty(item.id, item.name, 1)}
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

        {/* Summary + save */}
        <div className="shrink-0 border-t border-border bg-card">
          {Object.values(editingRound.items).length > 0 && (
            <div className="px-4 pt-3 pb-2 space-y-2 max-h-40 overflow-y-auto">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Updated Order ({Object.values(editingRound.items).reduce((s, i) => s + i.quantity, 0)} items)
              </p>
              {Object.values(editingRound.items).map((item) => (
                <div key={item.menuItemId} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium flex-1 truncate">{item.menuItemName}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => editChangeQty(item.menuItemId, item.menuItemName, -1)}
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                    >
                      {item.quantity === 1 ? <Trash2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => editChangeQty(item.menuItemId, item.menuItemName, 1)}
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
              onClick={handleSaveEdit}
              size="lg"
              className="w-full h-16 text-xl font-bold uppercase tracking-wider gap-3 bg-primary hover:bg-primary/90"
              disabled={editBatch.isPending}
            >
              <CheckCircle2 className="w-6 h-6" />
              {editBatch.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    )}

    {showBillFor && (
      <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-y-auto">
        {/* Close bar */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
          <button
            onClick={() => setShowBillFor(null)}
            className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors"
          >
            <X className="w-5 h-5" />
            Done
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Customer Bill</span>
          <div className="w-16" />
        </div>

        <div className="flex-1 px-6 py-8 max-w-sm mx-auto w-full">
          {/* Bar name */}
          <p className="text-center text-xs font-black uppercase tracking-[0.3em] text-gray-400 mb-1">Trendy</p>
          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Customer */}
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Customer</p>
          <h1 className="text-4xl font-black uppercase tracking-tight text-gray-900 leading-none mb-1">
            {showBillFor.customerName}
          </h1>
          <p className="text-xs text-gray-400 mb-1">
            Served by <span className="font-bold text-gray-600">{showBillFor.waitressName}</span>
          </p>
          <p className="text-xs text-gray-400 mb-4">
            {format(new Date(showBillFor.firstOrderAt), "dd MMM yyyy · h:mm a")}
          </p>

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Items */}
          <div className="space-y-4">
            {showBillFor.rounds.map((round, idx) => (
              <div key={round.id}>
                {showBillFor.rounds.length > 1 && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    Round {idx + 1} · {format(new Date(round.createdAt), "h:mm a")}
                  </p>
                )}
                <div className="space-y-2">
                  {round.items.map((item, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-lg font-black text-gray-500 shrink-0">{item.quantity}×</span>
                        <span className="text-lg font-bold text-gray-900 truncate">{item.menuItemName}</span>
                      </div>
                      <span className="text-lg font-black text-gray-900 tabular-nums shrink-0">
                        {formatPrice(item.pricePence * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                {showBillFor.rounds.length > 1 && (
                  <div className="flex justify-between mt-2 pt-2 border-t border-dotted border-gray-200">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Subtotal</span>
                    <span className="text-sm font-bold text-gray-500 tabular-nums">{formatPrice(round.subtotal)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t-2 border-gray-900 my-4" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-black uppercase tracking-widest text-gray-600">Total</span>
            <span className="text-5xl font-black text-gray-900 tabular-nums">{formatPrice(showBillFor.total)}</span>
          </div>

          <div className="border-t border-dashed border-gray-300 my-6" />
          <p className="text-center text-xs text-gray-400 font-medium">Thank you for visiting Trendy!</p>
        </div>
      </div>
    )}

    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b border-border shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div className="text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide text-primary">
              {isWaitress ? "My Bills" : "Sales & Bills"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tab === "active" ? activeSubtitle : `${historyCustomers.length} ${isWaitress ? "my paid" : "paid"} sales`}
            </p>
          </div>
          <div className="w-10" />
        </div>

        {/* Tabs */}
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => { setTab("active"); setSelectedWaiter(null); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border transition-colors ${
              tab === "active"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            Active Bills
          </button>
          <button
            onClick={() => { setTab("history"); setSelectedWaiter(null); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border transition-colors ${
              tab === "history"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            Sales History
          </button>
        </div>

        {/* Waiter filter chips — both tabs, admin/bartender only */}
        {!isWaitress && (tab === "active" ? waiterNames : historyWaiterNames).length > 1 && (
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Waiter:</span>
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
            {(tab === "active" ? waiterNames : historyWaiterNames).map((name) => (
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
        ) : tab === "active" ? activeContent : historyContent}
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
      {tab === "history" && historyCustomers.length > 0 && !isWaitress && (
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

    {/* Return item selection modal */}
    {returnModal && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
        <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
          {/* Modal header */}
          <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-orange-400">Return to Waitress</p>
              <p className="text-xs text-muted-foreground mt-0.5">{returnModal.customerName}</p>
            </div>
            <button onClick={() => setReturnModal(null)} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Instruction */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs text-muted-foreground">Tap an item to flag it for return. For multiple quantities, use the +/− to choose how many to send back.</p>
          </div>

          {/* Item rows */}
          <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
            {returnModal.round.items.map((item) => {
              const returnQty = returnQtys.get(item.id) ?? 0;
              const isSelected = returnQty > 0;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleReturnItem(item.id)}
                  onKeyDown={(e) => e.key === "Enter" || e.key === " " ? toggleReturnItem(item.id) : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                    isSelected ? "border-orange-500 bg-orange-500/10" : "border-border bg-background hover:border-orange-300/50"
                  }`}
                >
                  {/* Checkbox visual */}
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                      isSelected ? "border-orange-500 bg-orange-500" : "border-border"
                    }`}
                  >
                    {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>

                  {/* Item name */}
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {item.menuItemName}
                  </span>

                  {/* Qty controls (only when selected and qty > 1) */}
                  {isSelected && item.quantity > 1 ? (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => adjustReturnQty(item.id, -1, item.quantity)}
                        className="w-6 h-6 rounded-md border border-orange-500/40 flex items-center justify-center text-orange-400 hover:bg-orange-500/20 transition-colors text-base leading-none"
                      >
                        −
                      </button>
                      <span className="w-10 text-center text-xs font-black text-orange-400">
                        {returnQty}/{item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustReturnQty(item.id, 1, item.quantity)}
                        className="w-6 h-6 rounded-md border border-orange-500/40 flex items-center justify-center text-orange-400 hover:bg-orange-500/20 transition-colors text-base leading-none"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground font-bold shrink-0">×{item.quantity}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 pt-1 flex gap-2">
            <button
              onClick={() => setReturnModal(null)}
              className="flex-1 h-11 rounded-xl border border-border text-sm font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmReturn}
              disabled={returnQtys.size === 0 || returnBatch.isPending}
              className="flex-1 h-11 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-black uppercase tracking-wide transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {returnBatch.isPending ? "Returning..." : `Return ${[...returnQtys.values()].reduce((s, q) => s + q, 0)} Item${[...returnQtys.values()].reduce((s, q) => s + q, 0) !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
