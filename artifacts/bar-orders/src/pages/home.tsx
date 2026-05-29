import { useMemo } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogIn, Monitor, LogOut, Receipt, Settings, Users, KeyRound, AlertTriangle, CheckCircle2, Activity, BookOpen, Bike, Tag, BarChart2, ShoppingCart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.jpg";
import {
  useGetOrderBatches,
  getGetOrderBatchesQueryKey,
  getGetStaffQueryKey,
  useGetStaff,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  waitress: "Waitress",
  bartender: "Bartender",
  bike_manager: "Bike Manager",
};

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-primary/20 text-primary",
  waitress: "bg-amber-500/20 text-amber-400",
  bartender: "bg-blue-500/20 text-blue-400",
  bike_manager: "bg-teal-500/20 text-teal-400",
};

export default function Home() {
  const { user, logout, role, isAdmin, isWaitress, isBartender, isBikeManager, hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : "Staff";

  const { data: batches } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 30000,
      enabled: isWaitress || isBartender,
    },
  });

  const { data: staffList } = useGetStaff({
    query: { queryKey: getGetStaffQueryKey() },
  });

  const myOutstanding = useMemo(() => {
    if (!batches || !isWaitress || !displayName) return 0;
    return batches
      .filter((b) => b.status !== "paid" && b.waitressName === displayName)
      .reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.pricePence * i.quantity, 0), 0);
  }, [batches, isWaitress, displayName]);

  const myTodayPaid = useMemo(() => {
    if (!batches || !(isWaitress || isBartender) || !displayName) return 0;
    const today = new Date().toDateString();
    return batches
      .filter((b) => b.status === "paid" && b.waitressName === displayName && new Date(b.createdAt).toDateString() === today)
      .reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.pricePence * i.quantity, 0), 0);
  }, [batches, isWaitress, isBartender, displayName]);

  const myBonusPercent = useMemo(() => {
    if (!staffList || !displayName) return 0;
    return staffList.find((s) => s.name === displayName)?.bonusPercent ?? 0;
  }, [staffList, displayName]);

  const myBonusEarned = Math.round(myTodayPaid * myBonusPercent / 100);

  const myBarHolds = useMemo(() => {
    if (!batches || !isBartender || !displayName) return [];
    return batches.filter((b) => (b.status as string) === "on_hold" && b.saleType === "bar" && b.waitressName === displayName);
  }, [batches, isBartender, displayName]);

  const myBarHoldsTotal = myBarHolds.reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.pricePence * i.quantity, 0), 0);

  // Permission-based access flags for non-admin staff
  const canManageProducts = !isAdmin && (hasPermission("manage_products") || hasPermission("change_prices"));
  const canManageCategories = !isAdmin && hasPermission("manage_categories");
  const canManageStaff = !isAdmin && hasPermission("manage_staff");
  const canViewActivity = !isAdmin && hasPermission("view_activity");
  const canAccessBikes = !isAdmin && !isBikeManager && hasPermission("access_bikes");

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <img src={logo} alt="Trendy" className="w-24 h-24 object-contain rounded-xl" />
          </div>
          <p className="text-muted-foreground">
            Logged in as <span className="text-foreground font-semibold">{displayName}</span>
            {role && (
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${ROLE_COLOR[role] ?? "bg-muted text-muted-foreground"}`}>
                {ROLE_LABEL[role] ?? role}
              </span>
            )}
          </p>
        </div>

        <div className="grid gap-4">

          {isWaitress && (
            <>
              {/* Outstanding credit accountability card */}
              <Link href="/bills" className="w-full">
                <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors ${
                  myOutstanding > 0
                    ? "bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/15"
                    : "bg-green-500/10 border-green-500/30 hover:bg-green-500/15"
                }`}>
                  {myOutstanding > 0
                    ? <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                    : <Receipt className="w-5 h-5 text-green-500 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-black uppercase tracking-widest ${myOutstanding > 0 ? "text-amber-400" : "text-green-500"}`}>
                      My Outstanding Credit
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {myOutstanding > 0 ? "Tap to see your unpaid bills" : "All your bills are settled"}
                    </p>
                  </div>
                  <span className={`text-xl font-black tabular-nums shrink-0 ${myOutstanding > 0 ? "text-amber-400" : "text-green-500"}`}>
                    {formatPrice(myOutstanding)}
                  </span>
                </div>
              </Link>
              {/* Bonus card */}
              {myBonusPercent > 0 && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-400">My Bonus Today</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{myBonusPercent}% of {formatPrice(myTodayPaid)} paid sales</p>
                  </div>
                  <span className="text-xl font-black tabular-nums shrink-0 text-emerald-400">{formatPrice(myBonusEarned)}</span>
                </div>
              )}
              <Link href="/waitress" className="w-full">
                <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <LogIn className="w-6 h-6" />
                  Take Order
                </Button>
              </Link>
              <Link href="/menu" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <BookOpen className="w-5 h-5" />
                  Show Menu to Customer
                </Button>
              </Link>
            </>
          )}

          {isBartender && (
            <>
              {/* Bar outstanding holds card */}
              {myBarHolds.length > 0 && (
                <Link href="/bills" className="w-full">
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-center gap-3 hover:bg-red-500/15 transition-colors">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black uppercase tracking-widest text-red-400">Bar Outstanding</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{myBarHolds.length} unpaid hold{myBarHolds.length !== 1 ? "s" : ""} · only admin can clear</p>
                    </div>
                    <span className="text-xl font-black tabular-nums shrink-0 text-red-400">{formatPrice(myBarHoldsTotal)}</span>
                  </div>
                </Link>
              )}
              {/* Bonus card for bartender */}
              {myBonusPercent > 0 && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-400">My Bonus Today</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{myBonusPercent}% of {formatPrice(myTodayPaid)} paid sales</p>
                  </div>
                  <span className="text-xl font-black tabular-nums shrink-0 text-emerald-400">{formatPrice(myBonusEarned)}</span>
                </div>
              )}
              <Link href="/bills" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <Receipt className="w-5 h-5" />
                  Active Bills
                </Button>
              </Link>
              <Link href="/direct-sale" className="w-full">
                <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <ShoppingCart className="w-6 h-6" />
                  Direct Sale
                </Button>
              </Link>
              <Link href="/bar" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <Monitor className="w-5 h-5" />
                  Bar Display
                </Button>
              </Link>
              <Link href="/menu" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <BookOpen className="w-5 h-5" />
                  Show Menu to Customer
                </Button>
              </Link>
            </>
          )}

          {(isBikeManager || canAccessBikes) && !isAdmin && (
            <Link href="/bikes" className="w-full">
              <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                <Bike className="w-6 h-6" />
                Bike Management
              </Button>
            </Link>
          )}

          {isAdmin && (
            <>
              <Link href="/admin" className="w-full">
                <Button size="lg" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <Settings className="w-5 h-5" />
                  Manage Products
                </Button>
              </Link>

              <Link href="/admin/staff" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <Users className="w-5 h-5" />
                  Manage Staff
                </Button>
              </Link>

              <Link href="/bills" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <Receipt className="w-5 h-5" />
                  All Active Bills
                </Button>
              </Link>

              <Link href="/bar" className="w-full">
                <Button size="lg" variant="secondary" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <Monitor className="w-5 h-5" />
                  Bar Display
                </Button>
              </Link>

              <Link href="/admin/activity-log" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/30 text-primary/70 hover:bg-primary/10">
                  <Activity className="w-5 h-5" />
                  Activity Log
                </Button>
              </Link>
              <Link href="/admin/categories" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/30 text-primary/70 hover:bg-primary/10">
                  <Tag className="w-5 h-5" />
                  Manage Categories
                </Button>
              </Link>
              <Link href="/bikes" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/30 text-primary/70 hover:bg-primary/10">
                  <Bike className="w-5 h-5" />
                  Bike Management
                </Button>
              </Link>
              <Link href="/sales-report" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/30 text-primary/70 hover:bg-primary/10">
                  <BarChart2 className="w-5 h-5" />
                  Sales Report
                </Button>
              </Link>
              <Link href="/menu" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <BookOpen className="w-5 h-5" />
                  Show Menu to Customer
                </Button>
              </Link>
            </>
          )}

          {/* ── Permission-based nav for non-admin staff ── */}
          {canManageProducts && (
            <Link href="/admin" className="w-full">
              <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                <Settings className="w-5 h-5" />
                Manage Products
              </Button>
            </Link>
          )}
          {canManageCategories && (
            <Link href="/admin/categories" className="w-full">
              <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/30 text-primary/70 hover:bg-primary/10">
                <Tag className="w-5 h-5" />
                Manage Categories
              </Button>
            </Link>
          )}
          {canManageStaff && (
            <Link href="/admin/staff" className="w-full">
              <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/30 text-primary/70 hover:bg-primary/10">
                <Users className="w-5 h-5" />
                Manage Staff
              </Button>
            </Link>
          )}
          {canViewActivity && (
            <Link href="/admin/activity-log" className="w-full">
              <Button size="lg" variant="outline" className="w-full h-16 text-base font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/30 text-primary/70 hover:bg-primary/10">
                <Activity className="w-5 h-5" />
                Activity Log
              </Button>
            </Link>
          )}

          <Link href="/change-pin" className="w-full">
            <button className="w-full h-10 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider">
              <KeyRound className="w-4 h-4" />
              Change My PIN
            </button>
          </Link>

          <button
            onClick={logout}
            className="w-full h-10 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
