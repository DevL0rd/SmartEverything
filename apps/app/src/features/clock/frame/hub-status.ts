import { useSyncStatus, type SyncStatus } from '../../../store/selectors';

export function isHubOffline(status: SyncStatus['status']): boolean {
  return status === 'interrupted' || status === 'refused';
}

export function useHubOffline(): boolean {
  return isHubOffline(useSyncStatus().status);
}
