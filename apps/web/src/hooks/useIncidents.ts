import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { aegisApi } from "@/services/api";
import type { CreateIncidentBody, IncidentListQuery } from "@/types/api";

export function useIncidents(params: IncidentListQuery = {}) {
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: () => aegisApi.listIncidents(params),
    refetchInterval: 5000,
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIncidentBody = {}) => aegisApi.createIncident(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => aegisApi.listIncidents({ limit: 1 }),
    refetchInterval: 10000,
    retry: false,
  });
}
