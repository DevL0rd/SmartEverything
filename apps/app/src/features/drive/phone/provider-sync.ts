import { Logger, background } from '@smarteverything/logging';
import { useEffect } from 'react';
import { errorFields } from '../../../design/log-tally';
import { useSession, useSyncStatus } from '../../../store/selectors';
import { nativeDriveProvider, type DriveProviderLink } from './provider';

const log = new Logger('app.drive');

export async function pairDriveProvider(
  link: DriveProviderLink,
  clientId: string,
): Promise<boolean> {
  if (!link.linked()) return false;
  try {
    await link.configure(clientId);
    log.info('drive.provider_paired');
    return true;
  } catch (error) {
    log.warn('drive.provider_pair_failed', errorFields(error));
    return false;
  }
}

export function useDriveProviderSync(link: DriveProviderLink = nativeDriveProvider): void {
  const clientId = useSession().client.id;
  const live = useSyncStatus().status === 'live';
  useEffect(() => {
    if (live) background(pairDriveProvider(link, clientId), 'drive.provider_pair_failed');
  }, [link, live, clientId]);
}
