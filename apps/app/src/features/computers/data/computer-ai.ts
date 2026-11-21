import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type ComputerAiSettingsPatch,
  type ComputerAiStatus,
  type ComputerAiModel,
  type ProviderMetadata,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { computerAiKey } from '../../../queries/keys';
import { notify } from '../../../components/toast-store';
import { background } from '@smarteverything/logging';

export function useComputerAi(
  deviceId: string,
): ReturnType<typeof useScreenQuery<Awaited<ReturnType<typeof readComputerAi>>>> {
  return useScreenQuery({
    queryKey: [...computerAiKey(deviceId), 'status'],
    queryFn: ({ signal }) => readComputerAi(deviceId, signal),
  });
}

export function readComputerAi(deviceId: string, signal: AbortSignal): Promise<ComputerAiStatus> {
  return api().call(E.readComputerAi, { params: { deviceId } }, { signal });
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
      background(
        client.invalidateQueries({ queryKey: computerAiKey(deviceId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) =>
      notify({ message: 'Claude settings weren’t changed', error, tone: 'critical' }),
  });
}

export function useComputerModels(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<ComputerAiModel[]>> {
  return useScreenQuery({
    queryKey: [...computerAiKey(deviceId), 'models'],
    queryFn: ({ signal }) =>
      api().call(E.listComputerClaudeModels, { params: { deviceId } }, { signal }),
    enabled,
  });
}

export function useRecheckProvider(
  deviceId: string,
): ReturnType<typeof useMutation<ComputerAiModel[], Error, void>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api().call(E.listComputerClaudeModels, { params: { deviceId } }),
    onError: (error) => notify({ message: 'Claude wasn’t rechecked', error, tone: 'critical' }),
    onSettled: () => client.invalidateQueries({ queryKey: computerAiKey(deviceId) }),
  });
}

export function useComputerProviderMetadata(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<ProviderMetadata>> {
  return useScreenQuery({
    queryKey: [...computerAiKey(deviceId), 'provider-metadata'],
    queryFn: ({ signal }) =>
      api().call(E.readComputerClaudeProviderMetadata, { params: { deviceId } }, { signal }),
    enabled,
  });
}
