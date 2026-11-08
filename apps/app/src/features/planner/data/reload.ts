import { Logger, background } from '@smarteverything/logging';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { syncGoogle } from '../../../api/google';
import { useScreenLive } from '../../../design/animation-gate';
import { errorFields } from '../../../design/log-tally';
import { PLANNER_PREFIX } from '../../../queries/keys';
import { useGoogleAccount } from './google-account';

const log = new Logger('app.planner');

export interface ReloadInputs {
  readonly client: QueryClient;
  readonly linked: boolean;
  readonly sync: () => Promise<void>;
}

export async function reloadPlanner({ client, linked, sync }: ReloadInputs): Promise<void> {
  await Promise.all([
    client.refetchQueries({ queryKey: PLANNER_PREFIX, type: 'active' }),
    linked ? sync() : Promise.resolve(),
  ]);
}

const syncOwnGoogle = (): Promise<void> => syncGoogle(undefined);

export function usePlannerReload(): () => Promise<void> {
  const client = useQueryClient();
  const { linked } = useGoogleAccount();
  return useCallback(async () => {
    try {
      await reloadPlanner({ client, linked, sync: syncOwnGoogle });
    } catch (error) {
      log.warn('planner.reload_failed', { linked, ...errorFields(error) });
    }
  }, [client, linked]);
}

export function usePlannerSyncOnVisible(): void {
  const { linked } = useGoogleAccount();
  const { focused, foreground } = useScreenLive();
  const visible = focused && foreground;
  useEffect(() => {
    if (visible && linked) background(syncOwnGoogle(), 'planner.sync_failed');
  }, [visible, linked]);
}
