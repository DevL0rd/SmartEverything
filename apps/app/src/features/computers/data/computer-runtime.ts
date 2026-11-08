import { Logger, background } from '@smarteverything/logging';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type ComputerRuntimeStatus,
  type ComputerRuntimeSettingsPatch,
  type ComputerRuntimeModel,
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
export function useCodexModels(
  deviceId: string,
): ReturnType<typeof useScreenQuery<ComputerRuntimeModel[]>> {
  return useScreenQuery({
    queryKey: [...runtimeKey(deviceId), 'models'],
    queryFn: () =>
      api().call(E.readComputerRuntimeModels, { params: { deviceId, runtime: 'codex' } }),
  });
}
