import { useMutation } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AudioChangeInput,
  type AudioState,
  type ComputerFeature,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useComputerPart } from '../../../store/computer-live';
import { useComputerDetail } from './computer-metrics';
import { feedState, useStateSeed, type StateLoad } from './computer-state';

const log = new Logger('app.computers');

export interface AudioView {
  readonly state: AudioState | undefined;
  readonly features: readonly ComputerFeature[] | undefined;
  readonly load: StateLoad;
}

export function useComputerAudio(deviceId: string, online: boolean): AudioView {
  const state = useComputerPart(deviceId, 'audio');
  const features = useComputerDetail(deviceId, online).data?.features;
  const load = useStateSeed(deviceId, 'audio', online);
  return { state, features, load };
}

export function useAudioChange(
  deviceId: string,
): (change: AudioChangeInput, failed?: () => void) => void {
  const mutation = useMutation({
    mutationFn: async (change: AudioChangeInput) => {
      const state = await api().call(E.changeComputerAudio, {
        params: { deviceId },
        body: change,
      });
      feedState(deviceId, { audio: state });
      return state;
    },
    onError: (error, change) => {
      log.error('audio.change_failed', error, { deviceId, action: change.action });
      notify({ message: 'Sound wasn’t changed', error, tone: 'critical' });
    },
  });
  return (change, failed) => {
    mutation.mutate(change, failed === undefined ? {} : { onError: failed });
  };
}
