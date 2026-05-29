import { useEffect, useRef, useState, useCallback } from "react";

const IDLE_MS = 10 * 60 * 1000;
const WARN_MS = 60 * 1000;

const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "pointerdown"] as const;

export function useIdleLogout(logout: () => void, enabled: boolean) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAll = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
  }, []);

  const reset = useCallback(() => {
    if (!enabled) return;
    clearAll();
    setCountdown(null);

    warnTimer.current = setTimeout(() => {
      setCountdown(Math.round(WARN_MS / 1000));
      countdownInterval.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) return null;
          return prev - 1;
        });
      }, 1000);
    }, IDLE_MS - WARN_MS);

    idleTimer.current = setTimeout(() => {
      clearAll();
      setCountdown(null);
      logout();
    }, IDLE_MS);
  }, [enabled, logout, clearAll]);

  const dismiss = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (!enabled) {
      clearAll();
      setCountdown(null);
      return;
    }

    reset();

    const handle = () => reset();
    EVENTS.forEach((e) => window.addEventListener(e, handle, { passive: true }));

    return () => {
      clearAll();
      EVENTS.forEach((e) => window.removeEventListener(e, handle));
    };
  }, [enabled, reset, clearAll]);

  return { countdown, dismiss };
}
