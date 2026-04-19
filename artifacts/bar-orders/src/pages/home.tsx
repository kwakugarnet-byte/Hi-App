import { useMemo } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogIn, Monitor, LogOut, Receipt, Settings, Users, KeyRound, AlertTriangle, Clock, Play, Square, CheckCircle2, CalendarDays, Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.jpg";
import {
  useGetOrderBatches,
  getGetOrderBatchesQueryKey,
  useGetMyShift,
  getGetMyShiftQueryKey,
  useStartShift,
  useEndShift,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

function formatPrice(pence: number) {
  return `₵${(pence / 100).toFixed(2)}`;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  waitress: "Waitress",
  bartender: "Bartender",
};

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-primary/20 text-primary",
  waitress: "bg-amber-500/20 text-amber-400",
  bartender: "bg-blue-500/20 text-blue-400",
};

export default function Home() {
  const { user, logout, role, isAdmin, isWaitress, isBartender } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : "Staff";

  const { data: batches } = useGetOrderBatches({
    query: {
      queryKey: getGetOrderBatchesQueryKey(),
      refetchInterval: 30000,
      enabled: isWaitress,
    },
  });

  const { data: shiftData, isLoading: shiftLoading } = useGetMyShift({
    query: {
      queryKey: getGetMyShiftQueryKey(),
      refetchInterval: 60000,
    },
  });

  const startShift = useStartShift({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyShiftQueryKey() });
        toast({ title: "Day Started", description: "Your work day has begun. Good luck!" });
      },
      onError: () => {
        toast({ title: "Already Started", description: "Your day shift is already active.", variant: "destructive" });
      },
    },
  });

  const endShift = useEndShift({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyShiftQueryKey() });
        toast({ title: "Day Ended", description: "Your work day has been recorded. See you!" });
      },
      onError: () => {
        toast({ title: "No Active Shift", description: "No active shift found to end.", variant: "destructive" });
      },
    },
  });

  const myOutstanding = useMemo(() => {
    if (!batches || !isWaitress || !displayName) return 0;
    return batches
      .filter((b) => b.status !== "paid" && b.waitressName === displayName)
      .reduce((sum, b) => sum + b.items.reduce((s, i) => s + i.pricePence * i.quantity, 0), 0);
  }, [batches, isWaitress, displayName]);

  const shift = shiftData?.shift ?? null;
  const shiftActive = shift && !shift.endedAt;
  const shiftEnded = shift && shift.endedAt;
  const todayLabel = format(new Date(), "EEEE, d MMM yyyy");

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

          {/* ── DAY SHIFT STATUS CARD ── */}
          {!shiftLoading && (
            <div className={`rounded-xl border px-4 py-3 ${
              shiftEnded
                ? "bg-green-500/10 border-green-500/30"
                : shiftActive
                  ? "bg-primary/10 border-primary/40"
                  : "bg-card border-border"
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{todayLabel}</span>
              </div>

              {shiftEnded ? (
                /* Day fully ended */
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-black text-green-500 uppercase tracking-wide">Day Completed</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        {format(new Date(shift.startedAt), "h:mm a")}
                        <span className="mx-1">→</span>
                        {format(new Date(shift.endedAt!), "h:mm a")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : shiftActive ? (
                /* Shift in progress */
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-primary uppercase tracking-wide">Day In Progress</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      Started at {format(new Date(shift.startedAt), "h:mm a")}
                    </p>
                  </div>
                  <button
                    onClick={() => endShift.mutate()}
                    disabled={endShift.isPending}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-black uppercase tracking-wide disabled:opacity-50"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    End Day
                  </button>
                </div>
              ) : (
                /* Not started yet */
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground uppercase tracking-wide">Day Not Started</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Tap to clock in for today</p>
                  </div>
                  <button
                    onClick={() => startShift.mutate()}
                    disabled={startShift.isPending}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-black uppercase tracking-wide disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Start Day
                  </button>
                </div>
              )}
            </div>
          )}

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
              <Link href="/waitress" className="w-full">
                <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <LogIn className="w-6 h-6" />
                  Take Order
                </Button>
              </Link>
            </>
          )}

          {isBartender && (
            <>
              <Link href="/bar" className="w-full">
                <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <Monitor className="w-6 h-6" />
                  Bar Display
                </Button>
              </Link>

              <Link href="/waitress" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <LogIn className="w-5 h-5" />
                  Take Order
                </Button>
              </Link>

              <Link href="/bills" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <Receipt className="w-5 h-5" />
                  All Active Bills
                </Button>
              </Link>
            </>
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
            </>
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
