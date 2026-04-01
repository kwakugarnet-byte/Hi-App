import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogIn, Monitor, LogOut, Receipt, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user, logout, isAdmin } = useAuth();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : "Staff";

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-primary uppercase">The Bar</h1>
          <p className="text-muted-foreground">
            Logged in as <span className="text-foreground font-semibold">{displayName}</span>
            {isAdmin && <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Admin</span>}
          </p>
        </div>

        <div className="grid gap-4">
          {!isAdmin && (
            <>
              <Link href="/waitress" className="w-full">
                <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <LogIn className="w-6 h-6" />
                  Take Order
                </Button>
              </Link>

              <Link href="/bills" className="w-full">
                <Button size="lg" variant="outline" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3 border-primary/50 text-primary hover:bg-primary/10">
                  <Receipt className="w-5 h-5" />
                  My Outstanding Bills
                </Button>
              </Link>

              <Link href="/bar" className="w-full">
                <Button size="lg" variant="secondary" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <Monitor className="w-5 h-5" />
                  Bar Display
                </Button>
              </Link>
            </>
          )}

          {isAdmin && (
            <>
              <Link href="/admin" className="w-full">
                <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <Settings className="w-6 h-6" />
                  Manage Products
                </Button>
              </Link>

              <Link href="/bar" className="w-full">
                <Button size="lg" variant="secondary" className="w-full h-20 text-lg font-bold uppercase tracking-wider flex items-center justify-center gap-3">
                  <Monitor className="w-5 h-5" />
                  Bar Display
                </Button>
              </Link>
            </>
          )}

          <button
            onClick={logout}
            className="w-full h-12 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
