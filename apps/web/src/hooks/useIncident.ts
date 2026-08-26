import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { aegisApi } from "@/services/api";

export function useIncident(incidentId: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => aegisApi.getIncident(incidentId as string),
    enabled: Boolean(incidentId),
    refetchInterval: live ? 2000 : false,
    retry: 1,
  });
}

/** Re-fetch persisted findings/root cause once the pipeline reports completion (§IV.4). */
export function useRefetchOnCompletion(incidentId: string | undefined, finished: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!incidentId || !finished) return;
    void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
  }, [incidentId, finished, queryClient]);
}

export function useInvestigate(incidentId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => aegisApi.investigate(incidentId as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
    },
  });
}
