import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Waitress from "@/pages/waitress";
import Bar from "@/pages/bar";
import { useAuth } from "@workspace/replit-auth-web";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-muted-foreground text-sm uppercase tracking-widest animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tight text-primary uppercase">The Bar</h1>
            <p className="text-muted-foreground">Staff access only. Please log in to continue.</p>
          </div>
          <button
            onClick={login}
            className="w-full h-16 text-xl font-bold uppercase tracking-wider bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/waitress" component={Waitress} />
      <Route path="/bar" component={Bar} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate>
            <Router />
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
