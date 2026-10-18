import type { ReactNode } from 'react';
import { Banner } from '../../../components/banner';
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

export function useOfflineBanner(): ReactNode | undefined {
  return useHubLive() ? undefined : (
    <Banner
      tone="info"
      title="Offline · showing saved integrations"
      body="Connecting, revoking and tokens need your home hub."
      wrapBody
    />
  );
}
