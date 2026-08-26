import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { aegisApi } from "@/services/api";
import type {
  CreateContractBody,
  CreateProtocolBody,
  CreateTreasuryBody,
  MonitoringConfig,
  ReportIncidentBody,
} from "@/types/api";

export function useProtocols() {
  return useQuery({ queryKey: ["protocols"], queryFn: () => aegisApi.listProtocols() });
}

export function useProtocol(id: string | undefined) {
  return useQuery({
    queryKey: ["protocol", id],
    queryFn: () => aegisApi.getProtocol(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProtocolBody) => aegisApi.createProtocol(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["protocols"] }),
  });
}

export function useArchiveProtocol(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => aegisApi.archiveProtocol(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["protocols"] });
      void qc.invalidateQueries({ queryKey: ["protocol", id] });
    },
  });
}

export function useDeleteProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aegisApi.deleteProtocol(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["protocols"] }),
  });
}

export function useInvestigateContract(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contractId: string) => aegisApi.investigateContract(id, contractId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}

export function useContracts(id: string | undefined) {
  return useQuery({
    queryKey: ["contracts", id],
    queryFn: () => aegisApi.listContracts(id as string),
    enabled: Boolean(id),
  });
}
export function useCreateContract(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContractBody) => aegisApi.createContract(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contracts", id] }),
  });
}
export function useDeleteContract(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contractId: string) => aegisApi.deleteContract(id, contractId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contracts", id] }),
  });
}

export function useTreasury(id: string | undefined) {
  return useQuery({
    queryKey: ["treasury", id],
    queryFn: () => aegisApi.listTreasury(id as string),
    enabled: Boolean(id),
  });
}
export function useCreateTreasury(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTreasuryBody) => aegisApi.createTreasury(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["treasury", id] }),
  });
}
export function useDeleteTreasury(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (addressId: string) => aegisApi.deleteTreasury(id, addressId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["treasury", id] }),
  });
}

export function useMonitoring(id: string | undefined) {
  return useQuery({
    queryKey: ["monitoring", id],
    queryFn: () => aegisApi.getMonitoring(id as string),
    enabled: Boolean(id),
  });
}
export function useUpdateMonitoring(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<MonitoringConfig>) => aegisApi.updateMonitoring(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["monitoring", id] }),
  });
}

export function useIntegrationKeys(id: string | undefined) {
  return useQuery({
    queryKey: ["keys", id],
    queryFn: () => aegisApi.listIntegrationKeys(id as string),
    enabled: Boolean(id),
  });
}
export function useCreateIntegrationKey(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => aegisApi.createIntegrationKey(id, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["keys", id] }),
  });
}
export function useDeleteIntegrationKey(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => aegisApi.deleteIntegrationKey(id, keyId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["keys", id] }),
  });
}

export function useReportIncident(protocolId: string) {
  return useMutation({
    mutationFn: (body: ReportIncidentBody) => aegisApi.reportIncident(protocolId, body),
  });
}
