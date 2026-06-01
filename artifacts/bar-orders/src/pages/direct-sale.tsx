import { useState, useRef, useMemo, useEffect } from "react";
import { Link, Redirect } from "wouter";
import {
  ArrowLeft, ScanLine, Hash, Delete, X, Clock, Check, Plus, Minus, ShoppingCart,
} from "lucide-react";
import { useGetMenuItems, getGetMenuItemsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

type SaleItem = { menuItemId: number; name: string; pricePence: number; quantity: number };
type HeldSale = { id: string; label: string; items: SaleItem[]; batchId?: number };

function DirectSaleInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`.trim()
    : "Staff";

  const { data: menuItemsData } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });
  const menuItems = menuItemsData ?? [];

  const [currentItems, setCurrentItems] = useState<Record<number, SaleItem>>({});
  const [customerLabel, setCustomerLabel] = useState("");
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [showHoldPanel, setShowHoldPanel] = useState(false);

  const [barcodeValue, setBarcodeValue] = useState("");
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [showNumpad, setShowNumpad] = useState(false);
  const [codeDigits, setCodeDigits] = useState<string[]>([]);
  const [codeError, setCodeError] = useState(false);

  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recalledBatchId, setRecalledBatchId] = useState<number | null>(null);

  const [pendingItem, setPendingItem] = useState<{ menuItemId: number; name: string; pricePence: number } | null>(null);
  const [pendingQty, setPendingQty] = useState("1");

  useEffect(() => {
    fetch(`${BASE}/api/order-batches`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: Array<{
        id: number; status: string; saleType: string | null;
        customerName: string | null;
        items: Array<{ menuItemId: number; menuItemName: string; pricePence: number; quantity: number }>;
      }>) => {
        const held = data
          .filter((b) => b.status === "on_hold" && b.saleType === "bar")
          .map((b) => ({
            id: String(b.id),
            label: b.customerName ?? `Hold #${b.id}`,
            batchId: b.id,
            items: b.items.map((i) => ({
              menuItemId: i.menuItemId,
              name: i.menuItemName,
              pricePence: i.pricePence,
              quantity: i.quantity,
            })),
          }));
        if (held.length > 0) setHeldSales(held);
      })
      .catch(() => {});
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map((i) => i.category))).sort();
    return ["All", ...cats];
  }, [menuItems]);

  const filtered = useMemo(() => {
    return menuItems
      .filter((i) => activeCategory === "All" || i.category === activeCategory)
      .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menuItems, activeCategory, search]);

  const currentList = Object.values(currentItems);
  const total = currentList.reduce((s, i) => s + i.pricePence * i.quantity, 0);
  const hasItems = currentList.length > 0;

  const holdNameLower = customerLabel.trim().toLowerCase();
  const duplicateHold = !recalledBatchId && holdNameLower.length > 0
    && heldSales.some((h) => h.label.toLowerCase() === holdNameLower);

  function flashAdded(name: string) {
    setJustAdded(name);
    setTimeout(() => setJustAdded(null), 1400);
  }

  function addItem(menuItemId: number, qty = 1) {
    const item = menuItems.find((m) => m.id === menuItemId);
    if (!item) return;
    setCurrentItems((prev) => {
      const existing = prev[menuItemId];
      return {
        ...prev,
        [menuItemId]: { menuItemId, name: item.name, pricePence: item.pricePence, quantity: (existing?.quantity ?? 0) + qty },
      };
    });
    flashAdded(`${item.name}${qty > 1 ? ` ×${qty}` : ""}`);
  }

  function openQtyPrompt(menuItemId: number) {
    const item = menuItems.find((m) => m.id === menuItemId);
    if (!item) return;
    setPendingItem({ menuItemId, name: item.name, pricePence: item.pricePence });
    setPendingQty("1");
  }

  function confirmQty() {
    if (!pendingItem) return;
    const qty = Math.max(1, parseInt(pendingQty, 10) || 1);
    addItem(pendingItem.menuItemId, qty);
    setPendingItem(null);
    setPendingQty("1");
    setTimeout(() => barcodeRef.current?.focus(), 100);
  }

  function pressQtyDigit(d: string) {
    setPendingQty((prev) => {
      const next = prev === "1" && d !== "0" ? d : prev === "0" ? d : prev + d;
      const num = parseInt(next, 10);
      if (isNaN(num) || num > 999) return prev;
      return next;
    });
  }

  function backspaceQty() {
    setPendingQty((prev) => (prev.length <= 1 ? "1" : prev.slice(0, -1)));
  }

  function removeItem(menuItemId: number) {
    setCurrentItems((prev) => {
      const existing = prev[menuItemId];
      if (!existing || existing.quantity <= 1) {
        const next = { ...prev };
        delete next[menuItemId];
        return next;
      }
      return { ...prev, [menuItemId]: { ...existing, quantity: existing.quantity - 1 } };
    });
  }

  function handleBarcodeScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const val = barcodeValue.trim();
      if (!val) return;
      const match = menuItems.find((m) => m.barcode === val);
      if (match) {
        setBarcodeValue("");
        openQtyPrompt(match.id);
      } else {
        toast({ title: "Barcode not found", description: val, variant: "destructive" });
        setBarcodeValue("");
      }
    }
  }

  function pressCodeDigit(d: string) {
    if (codeDigits.length >= 4) return;
    const next = [...codeDigits, d];
    setCodeDigits(next);
    setCodeError(false);
    if (next.length === 4) {
      const code = next.join("");
      const match = menuItems.find((m) => m.sku === code);
      if (match) {
        setShowNumpad(false);
        setCodeDigits([]);
        openQtyPrompt(match.id);
      } else {
        setCodeError(true);
        setTimeout(() => { setCodeDigits([]); setCodeError(false); }, 900);
      }
    }
  }

  function backspaceCode() {
    setCodeDigits((p) => p.slice(0, -1));
    setCodeError(false);
  }

  function closeNumpad() {
    setShowNumpad(false);
    setCodeDigits([]);
    setCodeError(false);
    setTimeout(() => barcodeRef.current?.focus(), 100);
  }

  async function holdSale() {
    if (!hasItems || submitting) return;
    if (!customerLabel.trim()) {
      toast({ title: "Customer name required", description: "Enter a name before putting the order on hold", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const label = customerLabel.trim();
    try {
      const res = await fetch(`${BASE}/api/order-batches/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          waitressName: displayName,
          customerName: label,
          items: currentList.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const id = Date.now().toString();
      setHeldSales((prev) => [...prev, { id, label, items: currentList, batchId: data.id }]);
      setCurrentItems({});
      setCustomerLabel("");
      toast({ title: `"${label}" put on hold`, description: `${currentList.length} item(s) · ${formatPrice(total)}` });
      setTimeout(() => barcodeRef.current?.focus(), 100);
    } catch {
      toast({ title: "Failed to save hold", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function recallSale(heldId: string) {
    const held = heldSales.find((h) => h.id === heldId);
    if (!held) return;
    if (hasItems) {
      const label2 = customerLabel.trim() || `Customer ${heldSales.length + 1}`;
      const newHeldId = Date.now().toString();
      setHeldSales((prev) => {
        const without = prev.filter((h) => h.id !== heldId);
        return [...without, { id: newHeldId, label: label2, items: currentList }];
      });
    } else {
      setHeldSales((prev) => prev.filter((h) => h.id !== heldId));
    }
    const itemsMap: Record<number, SaleItem> = {};
    held.items.forEach((i) => { itemsMap[i.menuItemId] = i; });
    setCurrentItems(itemsMap);
    setCustomerLabel(held.label);
    setRecalledBatchId(held.batchId ?? null);
    setShowHoldPanel(false);
  }

  function discardHeld(heldId: string) {
    const held = heldSales.find((h) => h.id === heldId);
    setHeldSales((prev) => prev.filter((h) => h.id !== heldId));
    if (held?.batchId) {
      fetch(`${BASE}/api/order-batches/${held.batchId}/discard`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }
  }

  async function recordPayment() {
    if (!hasItems || submitting) return;
    setSubmitting(true);
    try {
      const customerName = customerLabel.trim() || "Bar Customer";
      let res: Response;
      if (recalledBatchId) {
        res = await fetch(`${BASE}/api/order-batches/${recalledBatchId}/pay`, {
          method: "POST",
          credentials: "include",
        });
      } else {
        res = await fetch(`${BASE}/api/order-batches/direct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            waitressName: displayName,
            customerName,
            items: currentList.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          }),
        });
      }
      if (!res.ok) throw new Error("Failed");
      setCurrentItems({});
      setCustomerLabel("");
      setRecalledBatchId(null);
      toast({ title: "Payment recorded!", description: `${customerName} · ${formatPrice(total)}` });
      setTimeout(() => barcodeRef.current?.focus(), 100);
    } catch {
      toast({ title: "Failed to record payment", description: "Check connection and try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto w-full">
          <Link href="/">
            <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex-1">
            <p className="font-black text-sm uppercase tracking-widest text-foreground">Direct Sale</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{displayName}</p>
          </div>
          {heldSales.length > 0 && (
            <button
              onClick={() => setShowHoldPanel(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wide hover:bg-amber-500/20 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              {heldSales.length} on hold
            </button>
          )}
        </div>
      </header>

      {/* Quick entry */}
      <div className="px-4 pt-3 pb-2 max-w-2xl mx-auto w-full space-y-2">
        {justAdded && (
          <div className="text-xs text-center text-primary font-bold uppercase tracking-wide">
            ✓ Added: {justAdded}
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={barcodeRef}
              type="text"
              placeholder="Scan barcode here…"
              value={barcodeValue}
              onChange={(e) => setBarcodeValue(e.target.value)}
              onKeyDown={handleBarcodeScan}
              autoFocus
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-card border border-border text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary text-foreground"
            />
          </div>
          <button
            onClick={() => { setShowNumpad(true); setCodeDigits([]); setCodeError(false); }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors text-sm font-bold uppercase tracking-wide shrink-0"
          >
            <Hash className="w-4 h-4" />
            Code
          </button>
        </div>

        {/* Search + category tabs */}
        <input
          type="text"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary text-foreground"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Item grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-44 max-w-2xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {filtered.map((item) => {
            const qty = currentItems[item.id]?.quantity ?? 0;
            return (
              <button
                key={item.id}
                onClick={() => addItem(item.id)}
                className={`relative text-left rounded-xl border px-3 py-3 transition-all active:scale-95 ${
                  qty > 0
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                {qty > 0 && (
                  <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full">
                    {qty}
                  </span>
                )}
                <p className="font-bold text-sm text-foreground leading-tight pr-6">{item.name}</p>
                <p className="text-primary font-black text-sm mt-1">{formatPrice(item.pricePence)}</p>
                {item.sku && (
                  <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5"># {item.sku}</p>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-2 sm:col-span-3 py-12 text-center text-muted-foreground text-sm">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* Bottom panel */}
      {hasItems && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border px-4 pt-3 pb-4">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {currentList.map((item) => (
                <div key={item.menuItemId} className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium truncate text-foreground">{item.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => removeItem(item.menuItemId)}
                      className="w-6 h-6 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => addItem(item.menuItemId)}
                      className="w-6 h-6 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="w-16 text-right text-sm font-bold text-foreground tabular-nums shrink-0">
                    {formatPrice(item.pricePence * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <input
                type="text"
                placeholder="Customer name (required to hold)"
                value={customerLabel}
                onChange={(e) => setCustomerLabel(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg bg-card border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary text-foreground ${duplicateHold ? "border-destructive" : "border-border"}`}
              />
              {duplicateHold && (
                <p className="text-[11px] text-destructive font-medium px-1">
                  This customer already has a hold — recall it from the holds panel to add items.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={holdSale}
                disabled={!customerLabel.trim() || duplicateHold || submitting}
                className="flex-1 h-12 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 text-sm font-bold uppercase tracking-wide hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Clock className="w-4 h-4" />
                Hold
              </button>
              <button
                onClick={recordPayment}
                disabled={submitting}
                className="flex-[2] h-12 rounded-xl bg-primary text-primary-foreground text-sm font-black uppercase tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Charge {formatPrice(total)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state CTA */}
      {!hasItems && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-muted-foreground/40 text-xs uppercase tracking-widest">
            <ShoppingCart className="w-4 h-4" />
            Tap items or scan to add
          </div>
        </div>
      )}

      {/* ── 4-digit numpad overlay ── */}
      {showNumpad && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end justify-center">
          <div className="bg-card border border-border border-b-0 w-full max-w-sm px-5 pt-5 pb-8 rounded-t-2xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black uppercase tracking-widest text-foreground">Enter 4-Digit Code</p>
              <button
                onClick={closeNumpad}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Digit dots */}
            <div className={`flex justify-center gap-5 ${codeError ? "animate-[shake_0.5s_ease-in-out]" : ""}`}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    codeDigits.length > i
                      ? codeError ? "bg-destructive border-destructive" : "bg-primary border-primary"
                      : "border-border bg-transparent"
                  }`}
                />
              ))}
            </div>
            {codeError && (
              <p className="text-center text-destructive text-xs font-bold -mt-2">Code not found</p>
            )}

            {/* Numpad grid */}
            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9"].map((d) => (
                <button
                  key={d}
                  onClick={() => pressCodeDigit(d)}
                  className="h-16 rounded-xl bg-background border border-border text-2xl font-bold text-foreground hover:border-primary hover:bg-primary/10 active:scale-95 transition-all"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                onClick={() => pressCodeDigit("0")}
                className="h-16 rounded-xl bg-background border border-border text-2xl font-bold text-foreground hover:border-primary hover:bg-primary/10 active:scale-95 transition-all"
              >
                0
              </button>
              <button
                onClick={backspaceCode}
                disabled={codeDigits.length === 0}
                className="h-16 rounded-xl bg-transparent border border-border text-muted-foreground hover:text-foreground hover:border-foreground active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quantity prompt overlay ── */}
      {pendingItem && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end justify-center">
          <div className="bg-card border border-border border-b-0 w-full max-w-sm px-5 pt-5 pb-8 rounded-t-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-foreground">How many?</p>
                <p className="text-xs text-muted-foreground mt-0.5">{pendingItem.name} · {formatPrice(pendingItem.pricePence)} each</p>
              </div>
              <button
                onClick={() => { setPendingItem(null); setTimeout(() => barcodeRef.current?.focus(), 100); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quantity display */}
            <div className="flex items-center justify-center">
              <span className="text-6xl font-black tabular-nums text-foreground">{pendingQty}</span>
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9"].map((d) => (
                <button
                  key={d}
                  onClick={() => pressQtyDigit(d)}
                  className="h-14 rounded-xl bg-background border border-border text-2xl font-bold text-foreground hover:border-primary hover:bg-primary/10 active:scale-95 transition-all"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => setPendingQty("1")}
                className="h-14 rounded-xl bg-transparent border border-border text-muted-foreground font-bold text-lg hover:text-foreground hover:border-foreground active:scale-95 transition-all"
              >
                C
              </button>
              <button
                onClick={() => pressQtyDigit("0")}
                className="h-14 rounded-xl bg-background border border-border text-2xl font-bold text-foreground hover:border-primary hover:bg-primary/10 active:scale-95 transition-all"
              >
                0
              </button>
              <button
                onClick={backspaceQty}
                className="h-14 rounded-xl bg-transparent border border-border text-muted-foreground hover:text-foreground hover:border-foreground active:scale-95 transition-all flex items-center justify-center"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Confirm */}
            <button
              onClick={confirmQty}
              className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-black text-base uppercase tracking-wide hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Add {pendingQty} × {pendingItem.name}
            </button>
          </div>
        </div>
      )}

      {/* ── On-hold panel ── */}
      {showHoldPanel && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end justify-center">
          <div className="bg-card border border-border border-b-0 w-full max-w-sm px-5 pt-5 pb-8 rounded-t-2xl flex flex-col max-h-[75vh]">
            <div className="flex items-center justify-between shrink-0 mb-4">
              <p className="text-sm font-black uppercase tracking-widest text-foreground">
                On Hold ({heldSales.length})
              </p>
              <button
                onClick={() => setShowHoldPanel(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              {heldSales.map((held) => {
                const heldTotal = held.items.reduce((s, i) => s + i.pricePence * i.quantity, 0);
                return (
                  <div key={held.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-foreground">{held.label}</p>
                      <span className="text-amber-400 font-black text-sm">{formatPrice(heldTotal)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {held.items.map((i) => `${i.name} ×${i.quantity}`).join(" · ")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => recallSale(held.id)}
                        className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
                      >
                        Recall
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DirectSale() {
  const { role, isLoading: authLoading } = useAuth();
  if (authLoading) return null;
  if (role !== "bartender" && role !== "admin") return <Redirect to="/" />;
  return <DirectSaleInner />;
}
