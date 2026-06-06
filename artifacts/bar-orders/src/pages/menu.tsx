import { useMemo, useState, useEffect } from "react";
import { useGetMenuItems, getGetMenuItemsQueryKey } from "@workspace/api-client-react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft, BookOpen, Calculator, Check, CheckCircle2,
  ChevronDown, ChevronUp, Copy, Loader2, MapPin, Minus,
  Phone, Plus, QrCode, ShoppingBag, Trash2, Truck, X, CreditCard,
} from "lucide-react";
import logo from "@/assets/logo.jpg";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

const CATEGORY_EMOJI: Record<string, string> = {
  Beer: "🍺",
  Cider: "🍎",
  Spirits: "🥃",
  Whiskey: "🥃",
  Wine: "🍷",
  "Soft Drinks": "🥤",
  Cocktails: "🍹",
  Shots: "🥃",
  Food: "🍽️",
  Snacks: "🍟",
  Meals: "🍽️",
};

// Categories that are considered "drinks" — food is everything else
const DRINK_CATEGORIES = new Set([
  "Beer", "Cider", "Spirits", "Whiskey", "Wine",
  "Soft Drinks", "Cocktails", "Shots", "Beverages",
]);

type MenuItem = { id: number; name: string; pricePence: number; category: string };
type Cart = Record<number, number>;

export default function Menu() {
  const { data: menuItems, isLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  const [activeTab, setActiveTab] = useState<"menu" | "calculator" | "order">("order");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [cart, setCart] = useState<Cart>({});

  // Order-tab internal state
  const [showDrinks, setShowDrinks] = useState(false);
  const [orderStep, setOrderStep] = useState<"browse" | "checkout">("browse");

  // Checkout form state
  const [orderName, setOrderName] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [nameAutoFilled, setNameAutoFilled] = useState(false);
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Order tracking — persisted in sessionStorage so refresh/navigation keeps state
  const [placedOrderId, setPlacedOrderIdRaw] = useState<number | null>(() => {
    const v = sessionStorage.getItem("trendy_order_id");
    return v ? parseInt(v, 10) : null;
  });
  const [placedOrderTotal, setPlacedOrderTotalRaw] = useState<number>(() => {
    const v = sessionStorage.getItem("trendy_order_total");
    return v ? parseInt(v, 10) : 0;
  });
  const [submitted, setSubmittedRaw] = useState<boolean>(() => {
    return sessionStorage.getItem("trendy_order_submitted") === "1";
  });
  const [trackingStatus, setTrackingStatus] = useState<string>("pending");
  const [trackingRejectionReason, setTrackingRejectionReason] = useState<string | null>(null);

  function setPlacedOrderId(id: number | null) {
    setPlacedOrderIdRaw(id);
    if (id == null) sessionStorage.removeItem("trendy_order_id");
    else sessionStorage.setItem("trendy_order_id", String(id));
  }
  function setPlacedOrderTotal(total: number) {
    setPlacedOrderTotalRaw(total);
    sessionStorage.setItem("trendy_order_total", String(total));
  }
  function setSubmitted(val: boolean) {
    setSubmittedRaw(val);
    if (val) sessionStorage.setItem("trendy_order_submitted", "1");
    else sessionStorage.removeItem("trendy_order_submitted");
  }

  // Hubtel payment
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<"sent" | "error" | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  // Call button phone number (fetched from settings)
  const [barOrderPhone, setBarOrderPhone] = useState<string | null>(null);

  // Fetch the bar's order phone number on mount
  useEffect(() => {
    fetch(`${BASE}/api/public/settings/order-phone`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.phone) setBarOrderPhone(data.phone); })
      .catch(() => {});
  }, []);

  // Auto-fill name from phone lookup (debounced)
  useEffect(() => {
    const phone = orderPhone.trim();
    if (phone.length < 7) return;

    // Instant fill from localStorage cache
    const cached = localStorage.getItem(`trendy_customer_${phone}`);
    if (cached && !orderName) {
      setOrderName(cached);
      setNameAutoFilled(true);
    }

    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${BASE}/api/public/customer-by-phone?phone=${encodeURIComponent(phone)}`);
        if (!r.ok) return;
        const data = await r.json() as { name: string | null };
        if (data.name) {
          localStorage.setItem(`trendy_customer_${phone}`, data.name);
          // Only fill if name is still empty or was previously auto-filled
          setOrderName((prev) => (!prev || nameAutoFilled) ? data.name! : prev);
          setNameAutoFilled(true);
        }
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderPhone]);

  // Poll order status after placing
  useEffect(() => {
    if (!submitted || !placedOrderId) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/api/public/order/${placedOrderId}`);
        if (!r.ok || !alive) return;
        const data = await r.json();
        setTrackingStatus(data.status);
        setTrackingRejectionReason(data.rejectionReason ?? null);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(interval); };
  }, [submitted, placedOrderId]);

  async function handleRequestPayment() {
    if (!orderName) return;
    setPaying(true);
    setPayResult(null);
    setPayError(null);
    try {
      const amountGhs = placedOrderTotal / 100;
      const res = await fetch(`${BASE}/api/public/hubtel/request-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: orderName,
          amountGhs,
          orderId: placedOrderId ?? undefined,
          description: `Trendy Bar order for ${orderName}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      const data = await res.json() as { checkoutUrl?: string };
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
        setPayResult("sent");
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (err) {
      setPayResult("error");
      setPayError((err as Error).message ?? "Failed to start payment.");
    } finally {
      setPaying(false);
    }
  }

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const menuUrl = `${window.location.origin}${base}/menu`;

  function copyLink() {
    navigator.clipboard.writeText(menuUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function setQty(id: number, delta: number) {
    setCart((prev) => {
      const next = { ...prev };
      const updated = (next[id] ?? 0) + delta;
      if (updated <= 0) delete next[id];
      else next[id] = updated;
      return next;
    });
  }

  function clearCart() {
    setCart({});
  }

  const categories = useMemo(() => {
    if (!menuItems) return [];
    const all = Array.from(new Set(menuItems.map((i) => i.category)));
    const food = all.filter((c) => !DRINK_CATEGORIES.has(c)).sort();
    const drinks = all.filter((c) => DRINK_CATEGORIES.has(c)).sort();
    return [...food, ...drinks];
  }, [menuItems]);

  // Separate food vs drinks
  const foodCategories = useMemo(
    () => categories.filter((c) => !DRINK_CATEGORIES.has(c)),
    [categories]
  );
  const drinkCategories = useMemo(
    () => categories.filter((c) => DRINK_CATEGORIES.has(c)),
    [categories]
  );

  // Grouped for menu tab
  const filtered = useMemo(() => {
    if (!menuItems) return [];
    return activeCategory === "All" ? menuItems : menuItems.filter((i) => i.category === activeCategory);
  }, [menuItems, activeCategory]);

  function sortCategories(entries: [string, MenuItem[]][]): [string, MenuItem[]][] {
    return entries.sort(([a], [b]) => {
      const aFood = !DRINK_CATEGORIES.has(a);
      const bFood = !DRINK_CATEGORIES.has(b);
      if (aFood !== bFood) return aFood ? -1 : 1;
      return a.localeCompare(b);
    });
  }

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return sortCategories([...map.entries()]);
  }, [filtered]);

  const groupedAll = useMemo(() => {
    if (!menuItems) return [];
    const map = new Map<string, MenuItem[]>();
    for (const item of menuItems) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return sortCategories([...map.entries()]);
  }, [menuItems]);

  const cartTotal = useMemo(() => {
    if (!menuItems) return 0;
    return menuItems.reduce((sum, item) => sum + (cart[item.id] ?? 0) * item.pricePence, 0);
  }, [cart, menuItems]);

  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const cartSummary = useMemo(() => {
    if (!menuItems) return [];
    return menuItems
      .filter((i) => (cart[i.id] ?? 0) > 0)
      .map((i) => ({ id: i.id, name: i.name, qty: cart[i.id]!, pricePence: i.pricePence }));
  }, [cart, menuItems]);

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    if (cartItemCount === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${BASE}/api/public/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: orderName.trim(),
          phone: orderPhone.trim(),
          orderType,
          deliveryLocation: orderType === "delivery" ? deliveryLocation.trim() : undefined,
          items: Object.entries(cart)
            .filter(([, qty]) => qty > 0)
            .map(([id, quantity]) => ({ menuItemId: Number(id), quantity })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
      }
      const json = await res.json();
      setPlacedOrderId(json.id ?? null);
      setPlacedOrderTotal(cartTotal);
      setTrackingStatus("pending");
      setTrackingRejectionReason(null);
      setSubmitted(true);
      clearCart();
      // Persist phone → name so returning customers are auto-recognised
      if (orderPhone.trim() && orderName.trim()) {
        localStorage.setItem(`trendy_customer_${orderPhone.trim()}`, orderName.trim());
      }
    } catch (err) {
      setSubmitError((err as Error).message || "Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startNewOrder() {
    setSubmitted(false);
    setPlacedOrderId(null);
    setPlacedOrderTotal(0);
    setTrackingStatus("pending");
    setTrackingRejectionReason(null);
    setOrderName("");
    setOrderPhone("");
    setNameAutoFilled(false);
    setOrderType("pickup");
    setDeliveryLocation("");
    setOrderStep("browse");
    setShowDrinks(false);
    clearCart();
    setActiveTab("menu");
  }

  // Inline item row with +/- controls (used in Order tab)
  function ItemRow({ item }: { item: MenuItem }) {
    const qty = cart[item.id] ?? 0;
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
        qty > 0 ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
          <p className="text-xs text-muted-foreground">{formatPrice(item.pricePence)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {qty > 0 && (
            <span className="text-xs font-black text-primary tabular-nums mr-1">
              {formatPrice(qty * item.pricePence)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setQty(item.id, -1)}
            disabled={qty === 0}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className={`w-6 text-center text-sm font-black tabular-nums ${qty > 0 ? "text-primary" : "text-muted-foreground"}`}>
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty(item.id, 1)}
            className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setShowQR(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-xs space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest">Scan to Order</h2>
              <button onClick={() => setShowQR(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-center p-4 bg-white rounded-xl">
              <QRCodeSVG
                value={menuUrl}
                size={200}
                imageSettings={{
                  src: logo,
                  height: 44,
                  width: 44,
                  excavate: true,
                }}
              />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
              <p className="flex-1 text-[11px] text-muted-foreground font-mono truncate">{menuUrl}</p>
              <button onClick={copyLink} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">Share this link or print for tables</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logo} alt="Trendy" className="w-10 h-10 rounded-lg object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black uppercase tracking-wide text-foreground leading-tight">Trendy Bar</h1>
            <p className="text-xs text-muted-foreground font-semibold">
              {activeTab === "order"
                ? orderStep === "checkout" ? "Checkout" : "Place an Order"
                : "Drinks Menu"}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowQR(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
              <QrCode className="w-3.5 h-3.5" />QR
            </button>
            <button onClick={copyLink} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Link"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        {!(activeTab === "order" && orderStep === "checkout") && (
          <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
            <button
              onClick={() => { setActiveTab("order"); setOrderStep("browse"); }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border transition-colors relative ${
                activeTab === "order" ? "bg-orange-500 text-black border-orange-500" : "border-border text-muted-foreground hover:border-orange-500/50 hover:text-foreground"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />Order
            </button>
            <button
              onClick={() => setActiveTab("menu")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border transition-colors ${
                activeTab === "menu" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />Menu
            </button>
            <button
              onClick={() => setActiveTab("calculator")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border transition-colors relative ${
                activeTab === "calculator" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />Calculate Bill
              {activeTab === "calculator" && cartItemCount > 0 && (
                <span className="ml-1 min-w-[18px] h-4 px-1 rounded-full text-[10px] font-black bg-primary-foreground text-primary flex items-center justify-center">{cartItemCount}</span>
              )}
            </button>
          </div>
        )}

        {/* Category pills — menu tab only */}
        {activeTab === "menu" && !isLoading && categories.length > 0 && (
          <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            {["All", ...categories].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border transition-colors ${
                  activeCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {cat === "All" ? "All" : `${CATEGORY_EMOJI[cat] ?? "🍹"} ${cat}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── MENU TAB ─────────────────────────────────────────────────── */}
      {activeTab === "menu" && (
        <div className="max-w-lg mx-auto px-4 py-5 space-y-6 pb-20">
          {isLoading ? (
            <div className="space-y-4 pt-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="space-y-2">
                  <div className="h-4 w-24 bg-card rounded animate-pulse" />
                  {[1, 2].map((m) => <div key={m} className="h-14 bg-card rounded-xl animate-pulse" />)}
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm pt-16">No items available</p>
          ) : (
            grouped.map(([category, items]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-base">{CATEGORY_EMOJI[category] ?? "🍹"}</span>
                  <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{category}</h2>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <p className="font-bold text-sm text-foreground">{item.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-base font-black tabular-nums text-primary">{formatPrice(item.pricePence)}</span>
                        <button
                          onClick={() => { setQty(item.id, 1); setActiveTab("calculator"); }}
                          className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CALCULATOR TAB ───────────────────────────────────────────── */}
      {activeTab === "calculator" && (
        <div className="max-w-lg mx-auto px-4 py-5 pb-36">
          {isLoading ? (
            <div className="space-y-3 pt-4">{[1, 2, 3, 4].map((n) => <div key={n} className="h-14 bg-card rounded-xl animate-pulse" />)}</div>
          ) : (
            <>
              <div className="space-y-6">
                {groupedAll.map(([category, items]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-base">{CATEGORY_EMOJI[category] ?? "🍹"}</span>
                      <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{category}</h2>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const qty = cart[item.id] ?? 0;
                        return (
                          <div key={item.id} className={`bg-card border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${qty > 0 ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{formatPrice(item.pricePence)} each</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {qty > 0 && <span className="text-xs font-black text-primary tabular-nums min-w-[52px] text-right">{formatPrice(qty * item.pricePence)}</span>}
                              <div className="flex items-center gap-1">
                                <button onClick={() => setQty(item.id, -1)} disabled={qty === 0} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className={`w-6 text-center text-sm font-black tabular-nums ${qty > 0 ? "text-primary" : "text-muted-foreground"}`}>{qty}</span>
                                <button onClick={() => setQty(item.id, 1)} className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {cartItemCount === 0 && (
                <div className="flex flex-col items-center justify-center pt-10 gap-3 text-center">
                  <Calculator className="w-10 h-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">Tap <strong>+</strong> on any drink to add it to your bill</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ORDER TAB ────────────────────────────────────────────────── */}
      {activeTab === "order" && (
        <div className="max-w-lg mx-auto px-4 py-5 pb-56">

          {/* ── TRACKING SCREEN ── */}
          {submitted ? (
            <div className="flex flex-col items-center pt-10 gap-6 text-center max-w-xs mx-auto">

              {trackingStatus === "pending" && (
                <>
                  <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-wide text-foreground">Order Sent!</h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      Your order is with the bar — waiting for them to confirm it.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-orange-400 font-bold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                    Waiting for confirmation…
                  </div>
                </>
              )}

              {(trackingStatus === "completed" || trackingStatus === "paid") && (
                <>
                  <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-wide text-green-400">Accepted!</h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      Your order has been accepted and is being prepared. It'll be ready soon!
                    </p>
                  </div>
                  {trackingStatus !== "paid" && (
                    <>
                      <button
                        onClick={handleRequestPayment}
                        disabled={paying}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase tracking-widest text-sm transition-colors"
                      >
                        {paying
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening checkout…</>
                          : <><CreditCard className="w-4 h-4" /> Pay Now · {formatPrice(placedOrderTotal)}</>}
                      </button>
                      {payResult === "sent" && (
                        <p className="text-xs text-green-400 font-bold text-center">Hubtel checkout opened — complete payment there, then return here.</p>
                      )}
                      {payResult === "error" && (
                        <p className="text-xs text-destructive font-bold text-center">{payError ?? "Something went wrong. Try again."}</p>
                      )}
                    </>
                  )}
                  {trackingStatus === "paid" && (
                    <div className="flex items-center gap-2 text-green-400 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4" /> Payment received — thank you!
                    </div>
                  )}
                </>
              )}

              {trackingStatus === "returned" && (
                <>
                  <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                    <X className="w-10 h-10 text-destructive" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-wide text-destructive">Order Declined</h2>
                    {trackingRejectionReason ? (
                      <div className="mt-3 bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{trackingRejectionReason}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2">
                        Sorry, your order could not be processed at this time.
                      </p>
                    )}
                    {barOrderPhone && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Questions? Call us at <span className="font-bold text-foreground">{barOrderPhone}</span>
                      </p>
                    )}
                  </div>
                </>
              )}

              <button onClick={startNewOrder} className="w-full py-3 rounded-xl bg-orange-500 text-black font-black uppercase tracking-wide text-sm hover:bg-orange-400 transition-colors mt-2">
                Place Another Order
              </button>
            </div>

          ) : orderStep === "checkout" ? (
            /* ── CHECKOUT STEP ── */
            <>
              <button
                onClick={() => setOrderStep("browse")}
                className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground mb-5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Edit Order
              </button>

              {/* Order summary */}
              <div className="mb-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Your Order</h3>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  {cartSummary.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md tabular-nums">×{item.qty}</span>
                        <span className="text-sm font-bold text-foreground">{item.name}</span>
                      </div>
                      <span className="text-sm font-black tabular-nums text-muted-foreground">{formatPrice(item.qty * item.pricePence)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total</span>
                    <span className="text-lg font-black tabular-nums text-foreground">{formatPrice(cartTotal)}</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handlePlaceOrder} className="space-y-6">
                {/* Order type */}
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">How would you like it?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setOrderType("pickup")}
                      className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${orderType === "pickup" ? "border-green-500 bg-green-500/10 text-green-400" : "border-border text-muted-foreground"}`}>
                      <ShoppingBag className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-wide">Pickup</span>
                      <span className="text-[10px] text-muted-foreground">Collect at the bar</span>
                    </button>
                    <button type="button" onClick={() => setOrderType("delivery")}
                      className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${orderType === "delivery" ? "border-purple-500 bg-purple-500/10 text-purple-400" : "border-border text-muted-foreground"}`}>
                      <Truck className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-wide">Delivery</span>
                      <span className="text-[10px] text-muted-foreground">Delivered to you</span>
                    </button>
                  </div>
                </div>

                {/* Contact */}
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Your Details</h3>
                  <div className="space-y-3">
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                      <input
                        type="tel" placeholder="Phone number" value={orderPhone}
                        onChange={(e) => setOrderPhone(e.target.value)} required
                        className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="text" placeholder="Your name" value={orderName}
                        onChange={(e) => { setOrderName(e.target.value); setNameAutoFilled(false); }} required
                        className={`w-full bg-card border rounded-xl px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 transition-colors ${nameAutoFilled ? "border-green-500/50 focus:border-green-500/70 focus:ring-green-500/20" : "border-border focus:border-primary/60 focus:ring-primary/20"}`}
                      />
                      {nameAutoFilled && (
                        <div className="flex items-center gap-1 mt-1 px-1">
                          <Check className="w-3 h-3 text-green-500 shrink-0" />
                          <span className="text-[11px] text-green-500 font-bold">Recognised from previous order</span>
                        </div>
                      )}
                    </div>
                    {orderType === "delivery" && (
                      <div className="relative">
                        <MapPin className="absolute left-4 top-3.5 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                        <textarea
                          placeholder="Delivery location / table number / address"
                          value={deliveryLocation}
                          onChange={(e) => setDeliveryLocation(e.target.value)}
                          required rows={2}
                          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {submitError && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-sm text-destructive font-medium">
                    {submitError}
                  </div>
                )}

                <button
                  type="submit" disabled={submitting}
                  className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black uppercase tracking-widest text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing Order...</>
                    : <><ShoppingBag className="w-4 h-4" /> Place Order · {formatPrice(cartTotal)}</>
                  }
                </button>
              </form>
            </>

          ) : (
            /* ── BROWSE STEP ── */
            <div className="space-y-8">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => <div key={n} className="h-16 bg-card rounded-xl animate-pulse" />)}
                </div>
              ) : foodCategories.length === 0 && drinkCategories.length === 0 ? (
                /* No menu items at all */
                <div className="flex flex-col items-center justify-center pt-10 gap-3 text-center">
                  <p className="text-3xl">🍽️</p>
                  <p className="text-sm font-bold text-muted-foreground">Menu not available</p>
                  <p className="text-xs text-muted-foreground">Please ask staff for help</p>
                </div>
              ) : foodCategories.length === 0 ? (
                /* Drinks-only menu — show everything directly */
                <div className="space-y-6">
                  {drinkCategories.map((category) => {
                    const items = menuItems?.filter((i) => i.category === category) ?? [];
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base">{CATEGORY_EMOJI[category] ?? "🍹"}</span>
                          <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{category}</h2>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="space-y-2">
                          {items.map((item) => <ItemRow key={item.id} item={item} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Food first, then optional drinks */
                <>
                  {/* Food categories */}
                  <div className="space-y-6">
                    {foodCategories.map((category) => {
                      const items = menuItems?.filter((i) => i.category === category) ?? [];
                      return (
                        <div key={category}>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-base">{CATEGORY_EMOJI[category] ?? "🍽️"}</span>
                            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{category}</h2>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                          <div className="space-y-2">
                            {items.map((item) => <ItemRow key={item.id} item={item} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Drinks — collapsible add-on */}
                  {drinkCategories.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowDrinks((v) => !v)}
                        className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 transition-all ${
                          showDrinks ? "border-primary/40 bg-primary/5" : "border-dashed border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🍺</span>
                          <div className="text-left">
                            <p className="text-sm font-black text-foreground">Would you also like drinks?</p>
                            <p className="text-xs text-muted-foreground">
                              {showDrinks ? "Tap to hide drinks" : "Tap to browse our drinks"}
                            </p>
                          </div>
                        </div>
                        <div className={`shrink-0 transition-colors ${showDrinks ? "text-primary" : "text-muted-foreground"}`}>
                          {showDrinks ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </button>

                      {showDrinks && (
                        <div className="mt-4 space-y-6">
                          {drinkCategories.map((category) => {
                            const items = menuItems?.filter((i) => i.category === category) ?? [];
                            return (
                              <div key={category}>
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-base">{CATEGORY_EMOJI[category] ?? "🍹"}</span>
                                  <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">{category}</h2>
                                  <div className="flex-1 h-px bg-border" />
                                </div>
                                <div className="space-y-2">
                                  {items.map((item) => <ItemRow key={item.id} item={item} />)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      {activeTab === "menu" && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border py-3 px-4">
          <p className="text-center text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">
            Prices include all charges · Ask staff for specials
          </p>
        </div>
      )}

      {activeTab === "calculator" && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-3 shadow-lg">
          <div className="max-w-lg mx-auto space-y-2">
            {cartItemCount > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pb-1">
                {menuItems?.filter((i) => (cart[i.id] ?? 0) > 0).map((item) => (
                  <span key={item.id} className="text-[11px] text-muted-foreground">{item.name} ×{cart[item.id]}</span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Estimated Total</p>
                <p className="text-2xl font-black text-foreground tabular-nums">{formatPrice(cartTotal)}</p>
                {cartItemCount > 0 && <p className="text-[11px] text-muted-foreground">{cartItemCount} item{cartItemCount !== 1 ? "s" : ""}</p>}
              </div>
              {cartItemCount > 0 && (
                <button onClick={clearCart} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors">
                  <Trash2 className="w-4 h-4" />Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Order tab sticky footer — always visible on Order tab */}
      {activeTab === "order" && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-lg">
          {/* Call button — permanent, green */}
          <div className="max-w-lg mx-auto px-4 pt-3">
            {barOrderPhone ? (
              <a
                href={`tel:${barOrderPhone}`}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black uppercase tracking-wide text-sm transition-colors"
              >
                <Phone className="w-4 h-4" />
                Call Us · {barOrderPhone}
              </a>
            ) : (
              <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-600/30 text-green-500/60 font-black uppercase tracking-wide text-sm cursor-default">
                <Phone className="w-4 h-4" />
                Call Us to Order or Check Your Order
              </div>
            )}
          </div>
          {/* Cart / action area — only in browse step */}
          {!submitted && orderStep === "browse" && (
            cartItemCount > 0 ? (
              <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{cartItemCount} item{cartItemCount !== 1 ? "s" : ""}</p>
                  <p className="text-xl font-black text-foreground tabular-nums">{formatPrice(cartTotal)}</p>
                </div>
                <button
                  onClick={() => setOrderStep("checkout")}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black uppercase tracking-wide text-sm transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Review Order
                </button>
              </div>
            ) : (
              <div className="max-w-lg mx-auto px-4 py-3">
                <p className="text-center text-xs text-muted-foreground font-semibold">Add items above to place an order</p>
              </div>
            )
          )}
          {/* Spacing for checkout and tracking steps */}
          {(submitted || orderStep === "checkout") && <div className="pb-3" />}
        </div>
      )}
    </div>
  );
}
