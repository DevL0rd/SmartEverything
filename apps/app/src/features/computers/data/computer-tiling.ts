import { Logger } from '@smarteverything/logging';
import { useMutation } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type TilingChangeInput,
  type TilingState,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from './computer-metrics';
import { feedState } from './computer-state';

const log = new Logger('app.computers');

export function useTilingState(deviceId: string): TilingState | undefined {
  return useComputerSelect(deviceId, (parts) => parts.tiling, sameJson);
}

export function useTilingChange(
  deviceId: string,
): ReturnType<typeof useMutation<TilingState, Error, TilingChangeInput>> {
  return useMutation({
    mutationFn: async (change: TilingChangeInput) => {
      log.info('tiling.change_started', { deviceId, action: change.action });
      const state = await api().call(E.changeComputerTiling, {
        params: { deviceId },
        body: change,
      });
      feedState(deviceId, { tiling: state });
      return state;
    },
    onError: (error, change) => {
      log.error('tiling.change_failed', error, { deviceId, action: change.action });
      notify({ message: 'The layout didn’t change', error, tone: 'critical' });
    },
  });
}
