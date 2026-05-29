import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Waitress from "@/pages/waitress";
import Bar from "@/pages/bar";
import Bills from "@/pages/bills";
import Admin from "@/pages/admin";
import AdminStaff from "@/pages/admin-staff";
import ChangePin from "@/pages/change-pin";
import ActivityLog from "@/pages/activity-log";
import AdminCategories from "@/pages/admin-categories";
import Bikes from "@/pages/bikes";
import BikeDetail from "@/pages/bike-detail";
import Menu from "@/pages/menu";
import SalesReport from "@/pages/sales-report";
import DirectSale from "@/pages/direct-sale";
import ChatPanel from "@/components/ChatPanel";
import { useAuth } from "@/hooks/useAuth";
import { useGetStaff, usePinLogin } from "@workspace/api-client-react";
import { Delete } from "lucide-react";
import logo from "@/assets/logo.jpg";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

type LoginStep = "select" | "pin";

function PinLogin() {
  const qc = useQueryClient();
  const [step, setStep] = useState<LoginStep>("select");
  const [selectedStaff, setSelectedStaff] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const { data: staffData, isLoading } = useGetStaff({
    query: { queryKey: ["staff"] },
  });
  const staff = Array.isArray(staffData) ? staffData : [];
  const pinLogin = usePinLogin();

  function selectStaff(s: { id: number; name: string }) {
    setSelectedStaff(s);
    setDigits([]);
    setError(false);
    setStep("pin");
  }

  function pressDigit(d: string) {
    if (digits.length >= 4 || pinLogin.isPending) return;
    const next = [...digits, d];
    setDigits(next);
    setError(false);

    if (next.length === 4) {
      pinLogin.mutate(
        { data: { staffId: selectedStaff!.id, pin: next.join("") } },
        {
          onSuccess: (data) => {
            qc.setQueryData(["auth", "user"], data);
          },
          onError: () => {
            setShake(true);
            setError(true);
            setDigits([]);
            setTimeout(() => setShake(false), 600);
          },
        },
      );
    }
  }

  function backspace() {
    setDigits((prev) => prev.slice(0, -1));
    setError(false);
  }

  function goBack() {
    setStep("select");
    setSelectedStaff(null);
    setDigits([]);
    setError(false);
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-muted-foreground text-sm uppercase tracking-widest animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center">
          <img
            src={logo}
            alt="Trendy"
            className="w-36 h-36 object-contain rounded-xl"
          />
        </div>

        {step === "select" ? (
          <>
            <p className="text-center text-muted-foreground text-sm uppercase tracking-widest">
              Who are you?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {staff?.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectStaff(s)}
                  className="h-20 rounded-xl border border-border bg-card text-foreground text-xl font-bold uppercase tracking-wide hover:border-primary hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-1">
              <p className="text-muted-foreground text-sm uppercase tracking-widest">
                Enter PIN for
              </p>
              <p className="text-2xl font-black uppercase text-foreground">
                {selectedStaff?.name}
              </p>
            </div>

            {/* PIN dots */}
            <div
              className={`flex justify-center gap-5 transition-all ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    digits.length > i
                      ? error
                        ? "bg-destructive border-destructive"
                        : "bg-primary border-primary"
                      : "border-border bg-transparent"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-center text-destructive text-sm font-bold">
                Incorrect PIN. Try again.
              </p>
            )}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  onClick={() => pressDigit(d)}
                  disabled={pinLogin.isPending}
                  className="h-20 rounded-xl bg-card border border-border text-3xl font-bold text-foreground hover:border-primary hover:bg-primary/10 active:scale-95 transition-all disabled:opacity-50"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={goBack}
                className="h-20 rounded-xl bg-transparent border border-border text-sm font-bold text-muted-foreground hover:text-foreground hover:border-foreground active:scale-95 transition-all uppercase tracking-wide"
              >
                Back
              </button>
              <button
                onClick={() => pressDigit("0")}
                disabled={pinLogin.isPending}
                className="h-20 rounded-xl bg-card border border-border text-3xl font-bold text-foreground hover:border-primary hover:bg-primary/10 active:scale-95 transition-all disabled:opacity-50"
              >
                0
              </button>
              <button
                onClick={backspace}
                disabled={digits.length === 0 || pinLogin.isPending}
                className="h-20 rounded-xl bg-transparent border border-border text-muted-foreground hover:text-foreground hover:border-foreground active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-muted-foreground text-sm uppercase tracking-widest animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PinLogin />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/waitress" component={Waitress} />
      <Route path="/bar" component={Bar} />
      <Route path="/bills" component={Bills} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/staff" component={AdminStaff} />
      <Route path="/admin/activity-log" component={ActivityLog} />
      <Route path="/admin/categories" component={AdminCategories} />
      <Route path="/bikes" component={Bikes} />
      <Route path="/bikes/:id" component={BikeDetail} />
      <Route path="/sales-report" component={SalesReport} />
      <Route path="/direct-sale" component={DirectSale} />
      <Route path="/change-pin" component={ChangePin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/menu" component={Menu} />
            <Route>
              <AuthGate>
                <Router />
                <ChatPanel />
              </AuthGate>
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
