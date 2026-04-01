import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Delete } from "lucide-react";
import { useChangePin } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

function PinDots({ length }: { length: number }) {
  return (
    <div className="flex gap-4 justify-center py-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-5 h-5 rounded-full border-2 transition-all ${
            i < length ? "bg-primary border-primary" : "border-muted-foreground"
          }`}
        />
      ))}
    </div>
  );
}

type Step = "new" | "confirm";

export default function ChangePin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("new");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const changePinMutation = useChangePin();

  const currentPin = step === "new" ? newPin : confirmPin;
  const setCurrentPin = step === "new" ? setNewPin : setConfirmPin;

  function pressKey(digit: string) {
    if (currentPin.length >= 4) return;
    const next = currentPin + digit;
    setCurrentPin(next);
    setError("");

    if (next.length === 4) {
      if (step === "new") {
        setTimeout(() => {
          setStep("confirm");
          setConfirmPin("");
        }, 150);
      } else {
        setTimeout(() => handleConfirm(next), 150);
      }
    }
  }

  function pressBack() {
    setCurrentPin(currentPin.slice(0, -1));
    setError("");
  }

  function handleConfirm(pin: string) {
    if (pin !== newPin) {
      setError("PINs don't match. Try again.");
      setStep("new");
      setNewPin("");
      setConfirmPin("");
      return;
    }

    changePinMutation.mutate(
      { data: { newPin: pin } },
      {
        onSuccess: () => {
          toast({ title: "PIN changed successfully" });
          navigate("/");
        },
        onError: () => {
          toast({ title: "Failed to change PIN", variant: "destructive" });
          setStep("new");
          setNewPin("");
          setConfirmPin("");
        },
      }
    );
  }

  const KEYS = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "back"],
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xs space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <h1 className="text-xl font-black uppercase tracking-wide text-primary">Change PIN</h1>
        </div>

        <div className="text-center">
          <p className="text-base font-bold uppercase tracking-widest text-foreground">
            {step === "new" ? "Enter New PIN" : "Confirm New PIN"}
          </p>
          {error && <p className="text-destructive text-sm mt-2 font-semibold">{error}</p>}
          <PinDots length={currentPin.length} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {KEYS.flat().map((key, i) => {
            if (!key) return <div key={i} />;
            if (key === "back") {
              return (
                <button
                  key={i}
                  onClick={pressBack}
                  className="h-16 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all active:scale-95"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => pressKey(key)}
                className="h-16 rounded-2xl bg-card border border-border text-2xl font-bold text-foreground hover:bg-primary/10 hover:border-primary/50 transition-all active:scale-95"
              >
                {key}
              </button>
            );
          })}
        </div>

        {changePinMutation.isPending && (
          <p className="text-center text-muted-foreground text-sm uppercase tracking-widest animate-pulse">Saving...</p>
        )}
      </div>
    </div>
  );
}
