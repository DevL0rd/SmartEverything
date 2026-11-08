import type { WatchTopic } from '@smarteverything/domain';
import { useLiveDemand } from '../../../../store/use-live-demand';

export const VACUUM_MAP_TOPICS: readonly WatchTopic[] = ['live'];

export function useVacuumMapDemand(deviceId: string, onScreen: boolean): void {
  useLiveDemand(deviceId, VACUUM_MAP_TOPICS, undefined, onScreen);
}
