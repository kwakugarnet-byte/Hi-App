import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  usePinLogout,
} from "@workspace/api-client-react";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetCurrentAuthUser({
    query: { queryKey: ["auth", "user"], staleTime: Infinity },
  });

  const logoutMutation = usePinLogout();

  const user = data?.user ?? null;
  const isAuthenticated = user != null;
  const role = user?.role ?? null;
  const isAdmin = role === "admin";
  const isWaitress = role === "waitress";
  const isBartender = role === "bartender";
  const isBikeManager = role === "bike_manager";

  const { data: permsData } = useQuery({
    queryKey: ["staff", "permissions"],
    queryFn: async (): Promise<{ permissions: string[] }> => {
      const res = await fetch(`${BASE}/api/staff/me/permissions`, { credentials: "include" });
      if (!res.ok) return { permissions: [] };
      return res.json();
    },
    enabled: isAuthenticated && !isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const permissions: string[] = isAdmin ? [] : (permsData?.permissions ?? []);

  function hasPermission(p: string): boolean {
    if (isAdmin) return true;
    return permissions.includes(p);
  }

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(["auth", "user"], { user: null });
        queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
        queryClient.removeQueries({ queryKey: ["staff", "permissions"] });
      },
    });
  }

  return { user, isLoading, isAuthenticated, role, isAdmin, isWaitress, isBartender, isBikeManager, permissions, hasPermission, logout };
}
