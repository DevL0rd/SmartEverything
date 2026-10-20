import { useEffect } from 'react';
import { Logger, background } from '@smarteverything/logging';
import { isBrushLinked, startBrushes, syncBrushes } from '../../../../modules/health-connect';
import { usePairedServer } from '../../../features/profiles';
import { useDevices } from '../../../store/selectors';
import { connectPermitted } from './bluetooth-permission';
import { isToothbrush } from './use-brush-device';

const log = new Logger('app.toothbrush');

async function bringUp(url: string, token: string): Promise<void> {
  try {
    const plans = await syncBrushes(url, token);
    log.info('toothbrush.synced', { toothbrushes: plans.length });
    if (plans.length > 0 && (await connectPermitted())) {
      await startBrushes();
    }
  } catch (error) {
    log.warn('toothbrush.not_started', { reason: String(error) });
  }
}

function useBrushKey(): string {
  return useDevices({ includeHidden: true })
    .filter(isToothbrush)
    .map((device) => device.id)
    .join(',');
}

export function BrushLinkHost(): null {
  const paired = usePairedServer();
  const url = paired?.url ?? null;
  const token = paired?.token ?? null;
  const key = useBrushKey();
  useEffect(() => {
    if (!isBrushLinked || url === null || token === null || key === '') {
      return undefined;
    }
    background(bringUp(url, token), 'toothbrush.up_failed');
    return undefined;
  }, [url, token, key]);
  return null;
}
