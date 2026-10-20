import { useEffect } from 'react';
import { Logger, background } from '@smarteverything/logging';
import {
  isTreadmillLinked,
  startTreadmills,
  syncTreadmills,
} from '../../../../modules/health-connect';
import { useDevices } from '../../../store/selectors';
import { usePairedServer } from '../../../features/profiles';
import { connectPermitted } from './bluetooth-permission';
import { isTreadmill } from './use-treadmill-device';

const log = new Logger('app.treadmill');

async function bringUp(url: string, token: string): Promise<void> {
  try {
    const plans = await syncTreadmills(url, token);
    log.info('treadmill.synced', { treadmills: plans.length });
    if (plans.length > 0 && (await connectPermitted())) {
      await startTreadmills();
    }
  } catch (error) {
    log.warn('treadmill.not_started', { reason: String(error) });
  }
}

function useTreadmillKey(): string {
  return useDevices({ includeHidden: true })
    .filter(isTreadmill)
    .map((device) => device.id)
    .join(',');
}

export function TreadmillLinkHost(): null {
  const paired = usePairedServer();
  const url = paired?.url ?? null;
  const token = paired?.token ?? null;
  const key = useTreadmillKey();
  useEffect(() => {
    if (!isTreadmillLinked || url === null || token === null || key === '') {
      return undefined;
    }
    background(bringUp(url, token), 'treadmill.up_failed');
    return undefined;
  }, [url, token, key]);
  return null;
}
