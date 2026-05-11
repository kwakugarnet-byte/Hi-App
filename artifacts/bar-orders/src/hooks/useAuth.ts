import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  usePinLogout,
} from "@workspace/api-client-react";

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

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(["auth", "user"], { user: null });
        queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
      },
    });
  }

  return { user, isLoading, isAuthenticated, role, isAdmin, isWaitress, isBartender, isBikeManager, logout };
}
