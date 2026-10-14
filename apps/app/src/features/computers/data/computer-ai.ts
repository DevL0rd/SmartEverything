import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ComputerAiSettingsPatch,
  type ComputerAiStatus,
  type ClaudeStatus,
  type ClaudeSession,
  type ComputerAiModel,
  type ProviderMetadata,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';

export function computerAiKey(deviceId: string): readonly string[] {
  return ['window', 'computer-ai', deviceId];
}

export function useComputerAi(
  deviceId: string,
): ReturnType<typeof useQuery<Awaited<ReturnType<typeof readComputerAi>>>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'status'],
    queryFn: () => readComputerAi(deviceId),
  });
}

function readComputerAi(deviceId: string): Promise<ComputerAiStatus> {
  return api().call(E.readComputerAi, { params: { deviceId } });
}

export function useComputerAiChange(
  deviceId: string,
): ReturnType<typeof useMutation<ComputerAiStatus, Error, ComputerAiSettingsPatch>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ComputerAiSettingsPatch) =>
      api().call(E.updateComputerAi, { params: { deviceId }, body }),
    onSuccess: (status) => {
      client.setQueryData([...computerAiKey(deviceId), 'status'], status);
      void client.invalidateQueries({ queryKey: computerAiKey(deviceId) });
    },
    onError: (error) =>
      notify({ message: 'Claude settings weren’t changed', error, tone: 'critical' }),
  });
}

export function useNativeStatus(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useQuery<ClaudeStatus>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'native-status'],
    queryFn: () => api().call(E.readComputerClaudeStatus, { params: { deviceId } }),
    enabled,
  });
}

export function useNativeSessions(
  deviceId: string,
  archived: boolean,
  enabled: boolean,
): ReturnType<typeof useQuery<ClaudeSession[]>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'sessions', String(archived)],
    queryFn: () =>
      api().call(E.listComputerClaudeSessions, {
        params: { deviceId },
        query: { archived, limit: 100 },
      }),
    enabled,
  });
}

export function useComputerModels(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useQuery<ComputerAiModel[]>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'models'],
    queryFn: () => api().call(E.listComputerClaudeModels, { params: { deviceId } }),
    enabled,
  });
}

export function useComputerProviderMetadata(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useQuery<ProviderMetadata>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'provider-metadata'],
    queryFn: () => api().call(E.readComputerClaudeProviderMetadata, { params: { deviceId } }),
    enabled,
  });
}
