import { useQueries } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ComputerDetail,
  type ComputerFeature,
  type DisplayOutput,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useScreenPaused } from '../../../design/screen-pause';
import { useScreenQuery } from '../../../queries/use-screen-query';

export interface ComputerChoices {
  readonly features: readonly ComputerFeature[] | undefined;
  readonly outputs: readonly string[];
  readonly inputs: readonly string[];
  readonly apps: readonly string[];
  readonly screens: readonly DisplayOutput[];
}

function detailQuery(
  deviceId: string,
  online: boolean,
): {
  readonly queryKey: readonly string[];
  readonly queryFn: () => Promise<ComputerDetail>;
  readonly enabled: boolean;
} {
  return {
    queryKey: ['window', 'computer-detail', deviceId],
    queryFn: () => api().call(E.readComputer, { params: { deviceId } }),
    enabled: online,
  };
}

export function useComputerChoices(deviceId: string, online: boolean): ComputerChoices {
  const features = useScreenQuery(detailQuery(deviceId, online)).data?.features;
  const audio = useScreenQuery({
    queryKey: ['window', 'automation-computer-audio', deviceId],
    queryFn: () => api().call(E.readComputerAudio, { params: { deviceId } }),
    enabled: online,
    retry: false,
  }).data;
  const displays = useScreenQuery({
    queryKey: ['window', 'automation-computer-displays', deviceId],
    queryFn: () => api().call(E.readComputerDisplays, { params: { deviceId } }),
    enabled: online,
    retry: false,
  }).data;
  return {
    features,
    outputs: audio?.outputs.map((output) => output.name) ?? [],
    inputs: audio?.inputs.map((input) => input.name) ?? [],
    apps: audio?.apps.map((app) => app.app) ?? [],
    screens: displays?.outputs.filter((output) => output.enabled) ?? [],
  };
}

export function useComputerFeatureLists(
  computers: readonly { readonly id: string; readonly online: boolean }[],
): ReadonlyMap<string, readonly ComputerFeature[]> {
  const paused = useScreenPaused();
  const lists = useQueries({
    queries: computers.map(({ id, online }) => ({
      ...detailQuery(id, online),
      subscribed: !paused,
    })),
    combine: (results): (readonly ComputerFeature[] | undefined)[] =>
      results.map((result) => result.data?.features),
  });
  return new Map(
    computers.flatMap(({ id }, index) => {
      const features = lists[index];
      return features === undefined ? [] : [[id, features] as const];
    }),
  );
}
