import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogIn, Monitor, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user, logout } = useAuth();

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
          </p>
        </div>

        <div className="grid gap-4">
          <Link href="/waitress" className="w-full">
            <Button size="lg" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
              <LogIn className="w-6 h-6" />
              Waitress POS
            </Button>
          </Link>

          <Link href="/bar" className="w-full">
            <Button size="lg" variant="secondary" className="w-full h-24 text-xl font-bold uppercase tracking-wider flex items-center justify-center gap-3">
              <Monitor className="w-6 h-6" />
              Bar Display
            </Button>
          </Link>

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
