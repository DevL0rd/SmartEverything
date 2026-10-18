import { API_ENDPOINTS as E, type ComputerParts, type STATE_TOPICS } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { computerLive } from '../../../store/computer-live';

export type StateTopic = (typeof STATE_TOPICS)[number];

export interface StateLoad {
  readonly error: Error | null;
  readonly retry: () => void;
}

const READS: Readonly<Record<StateTopic, (deviceId: string) => Promise<ComputerParts>>> = {
  audio: async (deviceId) => ({
    audio: await api().call(E.readComputerAudio, { params: { deviceId } }),
  }),
  displays: async (deviceId) => ({
    displays: await api().call(E.readComputerDisplays, { params: { deviceId } }),
  }),
  system: async (deviceId) => ({
    system: await api().call(E.readComputerSystem, { params: { deviceId } }),
  }),
  services: async (deviceId) => ({
    services: await api().call(E.readComputerServices, { params: { deviceId } }),
  }),
  windows: async (deviceId) => ({
    windows: await api().call(E.readComputerWindows, { params: { deviceId } }),
  }),
};

export function feedState(deviceId: string, parts: ComputerParts): void {
  computerLive.receive({ type: 'computer_live', deviceId, at: new Date().toISOString(), parts });
}

export async function seedState(deviceId: string, topic: StateTopic): Promise<ComputerParts> {
  const parts = await READS[topic](deviceId);
  if (computerLive.store(deviceId).get().parts[topic] === undefined) feedState(deviceId, parts);
  return parts;
}

export async function refreshState(deviceId: string, topic: StateTopic): Promise<void> {
  feedState(deviceId, await READS[topic](deviceId));
}

export function useStateSeed(deviceId: string, topic: StateTopic, enabled: boolean): StateLoad {
  const query = useScreenQuery({
    queryKey: ['window', 'computer-state', deviceId, topic],
    queryFn: () => seedState(deviceId, topic),
    enabled,
    retry: false,
  });
  return {
    error: query.error,
    retry: (): void => {
      background(query.refetch(), 'computer_state.refetch_failed');
    },
  };
}
