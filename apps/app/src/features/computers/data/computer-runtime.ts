import { Logger, background } from '@smarteverything/logging';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type ComputerRuntimeStatus,
  type ComputerRuntimeSettingsPatch,
  type CodexAiRead,
  type CodexAiExecute,
  type CodexAiReply,
} from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';

const log = new Logger('app.computers');
export function runtimeKey(deviceId: string): readonly string[] {
  return ['window', 'computer-runtime', deviceId, 'codex'];
}
export function useRuntimeSupported(): boolean {
  const connection = useConnection();
  return connection.status === 'paired';
}
export function useComputerRuntime(
  deviceId: string,
): ReturnType<typeof useScreenQuery<ComputerRuntimeStatus>> {
  const supported = useRuntimeSupported();
  const owner = useIsOwner();
  return useScreenQuery({
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
    mutationFn: (body: ComputerRuntimeSettingsPatch) => {
      log.info('runtime.update_started', {
        deviceId,
        runtime: 'codex',
        fields: Object.keys(body).join(','),
      });
      return api().call(E.updateComputerRuntime, { params: { deviceId, runtime: 'codex' }, body });
    },
    onSuccess: (state) => {
      log.info('runtime.update_succeeded', { deviceId, runtime: 'codex' });
      client.setQueryData([...runtimeKey(deviceId), 'status'], state);
      background(
        client.invalidateQueries({ queryKey: runtimeKey(deviceId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) => {
      log.error('runtime.update_failed', error, { deviceId, runtime: 'codex' });
      notify({ message: 'Codex settings weren’t changed', error, tone: 'critical' });
    },
  });
}
export async function readCodex(deviceId: string, request: CodexAiRead): Promise<CodexAiReply> {
  const startedAt = Date.now();
  const envelope = await api()
    .call(E.readComputerRuntimeState, {
      params: { deviceId, runtime: 'codex' },
      body: { runtime: 'codex', request },
    })
    .catch((error: unknown) => {
      log.warn('runtime.read_failed', {
        deviceId,
        operation: request.operation,
        error: error instanceof Error ? error.name : typeof error,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    });
  log.debug('runtime.read', () => ({
    deviceId,
    operation: request.operation,
    durationMs: Date.now() - startedAt,
  }));
  if (envelope.runtime !== 'codex' || envelope.reply.operation !== request.operation)
    throw new Error(`Expected Codex ${request.operation} reply.`);
  return envelope.reply;
}
async function executeCodex(deviceId: string, request: CodexAiExecute): Promise<CodexAiReply> {
  const operation = log.operation('runtime.execute', {
    deviceId,
    runtime: 'codex',
    operation: request.operation,
  });
  const envelope = await api()
    .call(E.executeComputerRuntime, {
      params: { deviceId, runtime: 'codex' },
      body: { runtime: 'codex', request },
    })
    .catch((error: unknown) => {
      operation.failed(error);
      throw error;
    });
  operation.succeeded();
  if (envelope.runtime !== 'codex' || envelope.reply.operation !== request.operation)
    throw new Error(`Expected Codex ${request.operation} result.`);
  return envelope.reply;
}
export function useCodexRead(
  deviceId: string,
  request: CodexAiRead,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<CodexAiReply>> {
  return useScreenQuery({
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
      background(
        client.invalidateQueries({ queryKey: runtimeKey(deviceId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) =>
      notify({ message: 'Codex operation could not be confirmed', error, tone: 'critical' }),
  });
}
