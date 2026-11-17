import { confirm } from '../../../components/confirm-store';
import { useSyncStatus } from '../../../store/selectors';

export function confirmRevoke(name: string): Promise<boolean> {
  return confirm({
    title: `Revoke access for ${name}?`,
    body: `${name} can no longer use SmartEverything.`,
    confirmLabel: 'Revoke access',
    tone: 'destructive',
  });
}

export function useHubLive(): boolean {
  return useSyncStatus().status === 'live';
}
