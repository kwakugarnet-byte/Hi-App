import { useMemo, useState } from "react";
import { useGetMenuItems, getGetMenuItemsQueryKey } from "@workspace/api-client-react";
import { QRCodeSVG } from "qrcode.react";
import { BookOpen, Calculator, Check, CheckCircle2, Copy, Loader2, MapPin, Minus, Phone, Plus, QrCode, ShoppingBag, Trash2, Truck, X } from "lucide-react";
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
};

type MenuItem = { id: number; name: string; pricePence: number; category: string };
type Cart = Record<number, number>;

export default function Menu() {
  const { data: menuItems, isLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  const [activeTab, setActiveTab] = useState<"menu" | "calculator" | "order">("menu");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [cart, setCart] = useState<Cart>({});

  // Order form state
  const [orderName, setOrderName] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      const cur = next[id] ?? 0;
      const updated = cur + delta;
      if (updated <= 0) {
        delete next[id];
      } else {
        next[id] = updated;
      }
      return next;
    });
  }

  function clearCart() {
    setCart({});
  }

  const categories = useMemo(() => {
    if (!menuItems) return [];
    return Array.from(new Set(menuItems.map((i) => i.category))).sort();
  }, [menuItems]);

  const filtered = useMemo(() => {
    if (!menuItems) return [];
    return activeCategory === "All"
      ? menuItems
      : menuItems.filter((i) => i.category === activeCategory);
  }, [menuItems, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const groupedAll = useMemo(() => {
    if (!menuItems) return [];
    const map = new Map<string, MenuItem[]>();
    for (const item of menuItems) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
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
      .map((i) => ({ id: i.id, name: i.name, qty: cart[i.id], pricePence: i.pricePence }));
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
      setSubmitted(true);
      clearCart();
    } catch (err) {
      setSubmitError((err as Error).message || "Failed to place order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startNewOrder() {
    setSubmitted(false);
    setOrderName("");
    setOrderPhone("");
    setOrderType("pickup");
    setDeliveryLocation("");
    setActiveTab("menu");
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">

      {/* QR Modal */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-xs space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest">Scan to Order</h2>
              <button onClick={() => setShowQR(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-center p-4 bg-white rounded-xl">
              <QRCodeSVG value={menuUrl} size={200} />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
              <p className="flex-1 text-[11px] text-muted-foreground font-mono truncate">{menuUrl}</p>
              <button onClick={copyLink} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Show this to customers or print for your tables
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logo} alt="Trendy" className="w-10 h-10 rounded-lg object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black uppercase tracking-wide text-foreground leading-tight">Trendy Bar</h1>
            <p className="text-xs text-muted-foreground font-semibold">Drinks Menu</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowQR(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              QR
            </button>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Link"}
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2">
          <button
            onClick={() => setActiveTab("menu")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border transition-colors ${
              activeTab === "menu"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Menu
          </button>
          <button
            onClick={() => setActiveTab("calculator")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border transition-colors relative ${
              activeTab === "calculator"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Calculate Bill
            {cartItemCount > 0 && (
              <span className={`ml-1 min-w-[18px] h-4 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
                activeTab === "calculator" ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
              }`}>
                {cartItemCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("order")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide border transition-colors relative ${
              activeTab === "order"
                ? "bg-orange-500 text-black border-orange-500"
                : "border-border text-muted-foreground hover:border-orange-500/50 hover:text-foreground"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Order
            {cartItemCount > 0 && (
              <span className={`ml-1 min-w-[18px] h-4 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
                activeTab === "order" ? "bg-black/20 text-black" : "bg-orange-500 text-black"
              }`}>
                {cartItemCount}
              </span>
            )}
          </button>
        </div>

        {/* Category pills — menu tab only */}
        {activeTab === "menu" && !isLoading && categories.length > 0 && (
          <div className="max-w-lg mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveCategory("All")}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border transition-colors ${
                activeCategory === "All"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border transition-colors ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {CATEGORY_EMOJI[cat] ?? "🍹"} {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── MENU TAB ────────────────────────────────────────────────────── */}
      {activeTab === "menu" && (
        <div className="max-w-lg mx-auto px-4 py-5 space-y-6 pb-20">
          {isLoading ? (
            <div className="space-y-4 pt-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="space-y-2">
                  <div className="h-4 w-24 bg-card rounded animate-pulse" />
                  {[1, 2, 3].map((m) => (
                    <div key={m} className="h-14 bg-card rounded-xl animate-pulse" />
                  ))}
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
                    <div
                      key={item.id}
                      className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <p className="font-bold text-sm text-foreground">{item.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-base font-black tabular-nums text-primary">
                          {formatPrice(item.pricePence)}
                        </span>
                        <button
                          onClick={() => { setQty(item.id, 1); setActiveTab("calculator"); }}
                          className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                          aria-label="Add to calculator"
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

      {/* ── CALCULATOR TAB ──────────────────────────────────────────────── */}
      {activeTab === "calculator" && (
        <div className="max-w-lg mx-auto px-4 py-5 pb-36">
          {isLoading ? (
            <div className="space-y-3 pt-4">
              {[1, 2, 3, 4].map((n) => <div key={n} className="h-14 bg-card rounded-xl animate-pulse" />)}
            </div>
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
                          <div
                            key={item.id}
                            className={`bg-card border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${
                              qty > 0 ? "border-primary/40 bg-primary/5" : "border-border"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{formatPrice(item.pricePence)} each</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {qty > 0 && (
                                <span className="text-xs font-black text-primary tabular-nums min-w-[52px] text-right">
                                  {formatPrice(qty * item.pricePence)}
                                </span>
                              )}
                              <div className="flex items-center gap-1">
                                <button
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
                                  onClick={() => setQty(item.id, 1)}
                                  className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
                                >
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

              {/* Empty state */}
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

      {/* ── ORDER TAB ───────────────────────────────────────────────────── */}
      {activeTab === "order" && (
        <div className="max-w-lg mx-auto px-4 py-5 pb-10">
          {submitted ? (
            /* Success screen */
            <div className="flex flex-col items-center justify-center pt-10 gap-6 text-center">
              <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-wide text-foreground">Order Placed!</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Your order has been sent to the bar. We'll get started on it right away.
                </p>
              </div>
              <button
                onClick={startNewOrder}
                className="px-6 py-3 rounded-xl bg-orange-500 text-black font-black uppercase tracking-wide text-sm hover:bg-orange-400 transition-colors"
              >
                Back to Menu
              </button>
            </div>
          ) : (
            <>
              {/* Cart summary */}
              {cartItemCount === 0 ? (
                <div className="flex flex-col items-center justify-center pt-10 gap-4 text-center">
                  <ShoppingBag className="w-10 h-10 text-muted-foreground/20" />
                  <div>
                    <p className="text-sm font-bold text-muted-foreground">Your order is empty</p>
                    <p className="text-xs text-muted-foreground mt-1">Browse the menu and add items to your order</p>
                  </div>
                  <button
                    onClick={() => setActiveTab("menu")}
                    className="px-5 py-2 rounded-xl border border-border text-xs font-black uppercase tracking-wide text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                  >
                    Browse Menu
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePlaceOrder} className="space-y-6">

                  {/* Order summary */}
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
                      Your Order
                    </h3>
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      {cartSummary.map((item) => (
                        <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md tabular-nums">×{item.qty}</span>
                            <span className="text-sm font-bold text-foreground">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-black tabular-nums text-muted-foreground">
                              {formatPrice(item.qty * item.pricePence)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQty(item.id, -item.qty)}
                              className="text-muted-foreground/50 hover:text-destructive transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total</span>
                        <span className="text-lg font-black tabular-nums text-foreground">{formatPrice(cartTotal)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("menu")}
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                    >
                      Edit order
                    </button>
                  </div>

                  {/* Order type */}
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
                      Order Type
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setOrderType("pickup")}
                        className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                          orderType === "pickup"
                            ? "border-green-500 bg-green-500/10 text-green-400"
                            : "border-border text-muted-foreground hover:border-border/80"
                        }`}
                      >
                        <ShoppingBag className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-wide">Pickup</span>
                        <span className="text-[10px] text-muted-foreground">Collect at the bar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType("delivery")}
                        className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                          orderType === "delivery"
                            ? "border-purple-500 bg-purple-500/10 text-purple-400"
                            : "border-border text-muted-foreground hover:border-border/80"
                        }`}
                      >
                        <Truck className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-wide">Delivery</span>
                        <span className="text-[10px] text-muted-foreground">Delivered to you</span>
                      </button>
                    </div>
                  </div>

                  {/* Contact details */}
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
                      Your Details
                    </h3>
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Your name"
                          value={orderName}
                          onChange={(e) => setOrderName(e.target.value)}
                          required
                          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Phone className="w-4 h-4 text-muted-foreground/60" />
                        </div>
                        <input
                          type="tel"
                          placeholder="Phone number"
                          value={orderPhone}
                          onChange={(e) => setOrderPhone(e.target.value)}
                          required
                          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                        />
                      </div>
                      {orderType === "delivery" && (
                        <div className="relative">
                          <div className="absolute left-4 top-3.5 pointer-events-none">
                            <MapPin className="w-4 h-4 text-muted-foreground/60" />
                          </div>
                          <textarea
                            placeholder="Delivery location / table number / address"
                            value={deliveryLocation}
                            onChange={(e) => setDeliveryLocation(e.target.value)}
                            required
                            rows={2}
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
                    type="submit"
                    disabled={submitting || cartItemCount === 0}
                    className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black uppercase tracking-widest text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Placing Order...</>
                    ) : (
                      <><ShoppingBag className="w-4 h-4" /> Place Order · {formatPrice(cartTotal)}</>
                    )}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
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
            {/* Item summary */}
            {cartItemCount > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 pb-1">
                {menuItems?.filter((i) => (cart[i.id] ?? 0) > 0).map((item) => (
                  <span key={item.id} className="text-[11px] text-muted-foreground">
                    {item.name} ×{cart[item.id]}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Estimated Total</p>
                <p className="text-2xl font-black text-foreground tabular-nums">
                  {formatPrice(cartTotal)}
                </p>
                {cartItemCount > 0 && (
                  <p className="text-[11px] text-muted-foreground">{cartItemCount} item{cartItemCount !== 1 ? "s" : ""}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cartItemCount > 0 && (
                  <>
                    <button
                      onClick={clearCart}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear
                    </button>
                    <button
                      onClick={() => setActiveTab("order")}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-black text-sm font-black hover:bg-orange-400 transition-colors"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      Order
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
