import { useEffect } from 'react';
import { Logger } from '@smarteverything/logging';
import { SHELLY_PLUGIN_ID, type ShellyDevice } from '@smarteverything/shelly';
import { z } from 'zod';
import { callPluginTool } from '../../api/plugins';
import { useSelected } from '../../design/external-store';
import { liveSupport, TrackingLeases, type LiveSupport } from './tracking-leases';
import { failure } from './use-presence-operation';

const log = new Logger('app.shelly-presence');
const HOLDER = 'view';
const TRACKING = z.object({ enabled: z.boolean() });

async function send(externalId: string, enabled: boolean): Promise<void> {
  const reply = await callPluginTool(SHELLY_PLUGIN_ID, 'set_live_view', {
    externalId,
    enabled,
    holder: HOLDER,
  });
  const confirmed = TRACKING.parse(reply.result).enabled;
  log.debug('live_view.set', { externalId, enabled, confirmed });
  if (confirmed !== enabled) throw new Error('Couldn’t change live view. Try again.');
}

const leases = new TrackingLeases({
  send,
  describe: failure,
  onFailure: (kind, externalId, cause): void => {
    log.warn(kind === 'start' ? 'live_view.start_failed' : 'live_view.release_failed', {
      externalId,
      errorKind: cause instanceof Error ? cause.name : typeof cause,
    });
  },
});

export interface TrackingLease {
  readonly support: LiveSupport | 'unknown';
  readonly tracking: boolean;
  readonly failed: string | null;
  readonly retry: () => void;
}

export function useTrackingLease(sensor: ShellyDevice | null, visible: boolean): TrackingLease {
  const externalId = sensor?.externalId ?? '';
  const support = sensor === null ? 'unknown' : liveSupport(sensor);
  const wanted = visible && support === 'ready';
  useEffect(() => {
    if (!wanted) return undefined;
    return leases.acquire(externalId);
  }, [wanted, externalId]);
  const phase = useSelected(leases.store, (map) => map.get(externalId)?.phase ?? 'off');
  const error = useSelected(leases.store, (map) => map.get(externalId)?.error ?? null);
  return {
    support,
    tracking: wanted && phase === 'held',
    failed: wanted && phase === 'failed' ? error : null,
    retry: (): void => {
      leases.retry(externalId);
    },
  };
}
