import { useMemo, useState } from "react";
import { useGetMenuItems, getGetMenuItemsQueryKey } from "@workspace/api-client-react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, QrCode, X } from "lucide-react";
import logo from "@/assets/logo.jpg";

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

export default function Menu() {
  const { data: menuItems, isLoading } = useGetMenuItems({
    query: { queryKey: getGetMenuItemsQueryKey() },
  });

  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const menuUrl = `${window.location.origin}/menu`;

  function copyLink() {
    navigator.clipboard.writeText(menuUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
              <p className="text-sm font-black uppercase tracking-widest text-foreground">Scan Menu</p>
              <button onClick={() => setShowQR(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center bg-white rounded-xl p-4">
              <QRCodeSVG
                value={menuUrl}
                size={200}
                level="M"
                imageSettings={{
                  src: logo,
                  width: 40,
                  height: 40,
                  excavate: true,
                }}
              />
            </div>

            <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
              <p className="flex-1 text-[11px] text-muted-foreground font-mono truncate">{menuUrl}</p>
              <button
                onClick={copyLink}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
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
          {/* QR + Copy actions */}
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

        {/* Category pills */}
        {!isLoading && categories.length > 0 && (
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

      {/* Menu items */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6 pb-16">
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
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  {category}
                </h2>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <p className="font-bold text-sm text-foreground">{item.name}</p>
                    <span className="text-base font-black tabular-nums text-primary shrink-0">
                      {formatPrice(item.pricePence)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border py-3 px-4">
        <p className="text-center text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">
          Prices include all charges · Ask staff for specials
        </p>
      </div>
    </div>
  );
}
