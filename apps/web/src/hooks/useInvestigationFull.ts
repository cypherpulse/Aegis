import { useQuery } from "@tanstack/react-query";

import { aegisApi } from "@/services/api";

export function useInvestigationFull(id: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ["investigation-full", id],
    queryFn: () => aegisApi.getInvestigationFull(id as string),
    enabled: Boolean(id),
    refetchInterval: live ? 2500 : false,
    retry: 1,
  });
}

export function useTools(id: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ["investigation-tools", id],
    queryFn: () => aegisApi.getTools(id as string),
    enabled: Boolean(id),
    refetchInterval: live ? 2500 : false,
  });
}
