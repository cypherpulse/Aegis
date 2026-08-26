import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { aegisApi } from "@/services/api";
import { connectWallet, signMessage } from "@/lib/wallet";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => aegisApi.me(),
    retry: false,
    staleTime: 30_000,
  });
}

export function useWalletLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const address = await connectWallet();
      const { message } = await aegisApi.walletNonce(address);
      const signature = await signMessage(address, message);
      const { user } = await aegisApi.walletVerify(address, signature);
      return user;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => aegisApi.logout(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["protocols"] });
    },
  });
}
