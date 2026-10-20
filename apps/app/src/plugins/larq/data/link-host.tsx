import { useEffect } from 'react';
import { Logger, background } from '@smarteverything/logging';
import { isBottleLinked, syncBottles } from '../../../../modules/health-connect';
import { usePairedServer } from '../../../features/profiles';
import { useDevices } from '../../../store/selectors';
import { connectPermitted } from './bluetooth-permission';
import { isBottle } from './use-bottle-device';

const log = new Logger('app.larq');

async function bringUp(url: string, token: string): Promise<void> {
  try {
    const status = await syncBottles(url, token);
    log.info('larq.synced', { bottles: status.length });
    if (status.length > 0 && !(await connectPermitted())) {
      log.warn('larq.connect_not_permitted', {});
    }
  } catch (error) {
    log.warn('larq.not_started', { reason: String(error) });
  }
}

export function bringUpBottles(url: string, token: string): void {
  if (isBottleLinked) {
    background(bringUp(url, token), 'larq.up_failed');
  }
}

function useBottleKey(): string {
  return useDevices({ includeHidden: true })
    .filter(isBottle)
    .map((device) => device.id)
    .join(',');
}

export function BottleLinkHost(): null {
  const paired = usePairedServer();
  const url = paired?.url ?? null;
  const token = paired?.token ?? null;
  const key = useBottleKey();
  useEffect(() => {
    if (url !== null && token !== null && key !== '') {
      bringUpBottles(url, token);
    }
  }, [url, token, key]);
  return null;
}
