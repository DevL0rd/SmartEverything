import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ComputerRuntimeStatus,
  type ComputerRuntimeSettingsPatch,
  type CodexAiRead,
  type CodexAiExecute,
  type CodexAiReply,
} from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { useServerComputerAiV2 } from '../../../api/connection/server-capabilities';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';

export function runtimeKey(deviceId: string): readonly string[] {
  return ['window', 'computer-runtime', deviceId, 'codex'];
}
export function useRuntimeSupported(): boolean {
  const connection = useConnection();
  return useServerComputerAiV2(connection.status === 'paired' ? connection.connection.url : null);
}
export function useComputerRuntime(
  deviceId: string,
): ReturnType<typeof useQuery<ComputerRuntimeStatus>> {
  const supported = useRuntimeSupported();
  const owner = useIsOwner();
  return useQuery({
    queryKey: [...runtimeKey(deviceId), 'status'],
    queryFn: () => api().call(E.readComputerRuntime, { params: { deviceId, runtime: 'codex' } }),
    enabled: supported && owner,
  });
}
export function useComputerRuntimeChange(
  deviceId: string,
): ReturnType<typeof useMutation<ComputerRuntimeStatus, Error, ComputerRuntimeSettingsPatch>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ComputerRuntimeSettingsPatch) =>
      api().call(E.updateComputerRuntime, { params: { deviceId, runtime: 'codex' }, body }),
    onSuccess: (state) => {
      client.setQueryData([...runtimeKey(deviceId), 'status'], state);
      void client.invalidateQueries({ queryKey: runtimeKey(deviceId) });
    },
    onError: (error) =>
      notify({ message: 'Codex settings weren’t changed', error, tone: 'critical' }),
  });
}
export async function readCodex(deviceId: string, request: CodexAiRead): Promise<CodexAiReply> {
  const envelope = await api().call(E.readComputerRuntimeState, {
    params: { deviceId, runtime: 'codex' },
    body: { runtime: 'codex', request },
  });
  if (envelope.runtime !== 'codex' || envelope.reply.operation !== request.operation)
    throw new Error(`Expected Codex ${request.operation} reply.`);
  return envelope.reply;
}
export async function executeCodex(
  deviceId: string,
  request: CodexAiExecute,
): Promise<CodexAiReply> {
  const envelope = await api().call(E.executeComputerRuntime, {
    params: { deviceId, runtime: 'codex' },
    body: { runtime: 'codex', request },
  });
  if (envelope.runtime !== 'codex' || envelope.reply.operation !== request.operation)
    throw new Error(`Expected Codex ${request.operation} result.`);
  return envelope.reply;
}
export function useCodexRead(
  deviceId: string,
  request: CodexAiRead,
  enabled: boolean,
): ReturnType<typeof useQuery<CodexAiReply>> {
  return useQuery({
    queryKey: [...runtimeKey(deviceId), 'read', request],
    queryFn: () => readCodex(deviceId, request),
    enabled,
  });
}
export function useCodexExecute(
  deviceId: string,
): ReturnType<typeof useMutation<CodexAiReply, Error, CodexAiExecute>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: CodexAiExecute) => executeCodex(deviceId, request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: runtimeKey(deviceId) });
    },
    onError: (error) =>
      notify({ message: 'Codex operation could not be confirmed', error, tone: 'critical' }),
  });
}
