import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { ValueStore } from '../../../design/external-store';
import { HEALTH_CONNECT_ON_DEVICE, onSyncProgress } from './health-connect';

const log = new Logger('app.health-connect');
const PROGRESS_SETTLE_MS = 2500;

export const DEVICE_KEY = ['device', 'health-connect'] as const;

export const syncingNow = new ValueStore(false);

export function useSyncProgressHost(): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!HEALTH_CONNECT_ON_DEVICE) {
      return undefined;
    }
    const refresh = (): void => {
      background(client.invalidateQueries({ queryKey: DEVICE_KEY }), 'queries.invalidate_failed');
    };
    let events = 0;
    let startedAt = 0;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const progress = onSyncProgress(() => {
      if (events === 0) {
        startedAt = Date.now();
        log.info('health.sync_progress_started');
      }
      events += 1;
      syncingNow.set(true);
      if (settle !== null) clearTimeout(settle);
      settle = setTimeout(() => {
        log.info('health.sync_progress_settled', {
          events,
          durationMs: Date.now() - startedAt - PROGRESS_SETTLE_MS,
        });
        events = 0;
        syncingNow.set(false);
        refresh();
      }, PROGRESS_SETTLE_MS);
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return (): void => {
      progress.remove();
      app.remove();
      if (settle !== null) clearTimeout(settle);
    };
  }, [client]);
}
