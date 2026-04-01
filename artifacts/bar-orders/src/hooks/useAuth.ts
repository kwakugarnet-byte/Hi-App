import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentAuthUser } from "@workspace/api-client-react";
import { usePinLogin as useApiPinLogin, usePinLogout as useApiPinLogout } from "@workspace/api-client-react";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetCurrentAuthUser({
    query: { queryKey: ["auth", "user"], staleTime: 30000 },
  });

  const logoutMutation = useApiPinLogout();

  const user = data?.user ?? null;
  const isAuthenticated = user != null;

  function logout() {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(["auth", "user"], { user: null });
        queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
      },
    });
  }

  return { user, isLoading, isAuthenticated, logout };
}
