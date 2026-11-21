import { API_ENDPOINTS as E, type ComputerParts, type STATE_TOPICS } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { computerLive } from '../../../store/computer-live';

export type StateTopic = Extract<(typeof STATE_TOPICS)[number], keyof ComputerParts>;

export interface StateLoad {
  readonly error: Error | null;
  readonly retry: () => void;
}

type StateRead = (
  deviceId: string,
  request: { readonly signal?: AbortSignal },
) => Promise<ComputerParts>;

const READS: Readonly<Record<StateTopic, StateRead>> = {
  audio: async (deviceId, request) => ({
    audio: await api().call(E.readComputerAudio, { params: { deviceId } }, request),
  }),
  displays: async (deviceId, request) => ({
    displays: await api().call(E.readComputerDisplays, { params: { deviceId } }, request),
  }),
  system: async (deviceId, request) => ({
    system: await api().call(E.readComputerSystem, { params: { deviceId } }, request),
  }),
  services: async (deviceId, request) => ({
    services: await api().call(E.readComputerServices, { params: { deviceId } }, request),
  }),
  windows: async (deviceId, request) => ({
    windows: await api().call(E.readComputerWindows, { params: { deviceId } }, request),
  }),
  tiling: async (deviceId, request) => ({
    tiling: await api().call(E.readComputerTiling, { params: { deviceId } }, request),
  }),
};

export function feedState(deviceId: string, parts: ComputerParts): void {
  computerLive.receive({ type: 'computer_live', deviceId, at: new Date().toISOString(), parts });
}

export async function seedState(
  deviceId: string,
  topic: StateTopic,
  signal: AbortSignal,
): Promise<ComputerParts> {
  const parts = await READS[topic](deviceId, { signal });
  if (computerLive.store(deviceId).get().parts[topic] === undefined) feedState(deviceId, parts);
  return parts;
}

export async function refreshState(deviceId: string, topic: StateTopic): Promise<void> {
  feedState(deviceId, await READS[topic](deviceId, {}));
}

export function useStateSeed(deviceId: string, topic: StateTopic, enabled: boolean): StateLoad {
  const query = useScreenQuery({
    queryKey: ['window', 'computer-state', deviceId, topic],
    queryFn: ({ signal }) => seedState(deviceId, topic, signal),
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
