import { type UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type WatchCaptureSummary } from '@smarteverything/domain';
import { WATCH_CAPTURES_KEY } from '../queries/keys';
import { useScreenQuery } from '../queries/use-screen-query';
import { api } from './transport';

export async function setDeveloperDevice(developer: boolean): Promise<boolean> {
  return (await api().call(E.setDeveloperDevice, { body: { developer } })).developer;
}

export function useWatchCaptures(): UseQueryResult<WatchCaptureSummary> {
  return useScreenQuery({
    queryKey: WATCH_CAPTURES_KEY,
    queryFn: () => api().call(E.readWatchCaptures, {}),
  });
}

export async function clearWatchCaptures(): Promise<void> {
  await api().call(E.clearWatchCaptures, {});
}
