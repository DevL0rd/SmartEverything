import { Logger, background } from '@smarteverything/logging';
import { useState } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useValue } from '../../../design/external-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { PREFS, usePref } from '../../../store/prefs';
import { retryHealthConnectWrites, usePairedServer, type RelayServer } from '../../profiles';
import { retryHealthConnectEntries } from '../../health-log';
import { useThisPhoneSource } from './this-phone';
import { DEVICE_KEY, syncingNow } from './sync-progress';
import { createActionRunner, type ActionOutcome, type ActionRunner } from './action-runner';
import {
  HEALTH_CONNECT_ON_DEVICE,
  connectPhone,
  grantedNothing,
  readGrants,
  readHealthConnectStatus,
  readLastSync,
  syncPhoneNow,
  type HealthConnectGrants,
  type HealthConnectStatus,
  type SyncReport,
} from './health-connect';

const log = new Logger('app.health-connect');

type HealthConnectAction = 'connect' | 'sync';

export interface HealthConnectControls {
  readonly status: UseQueryResult<HealthConnectStatus>;
  readonly grants: UseQueryResult<HealthConnectGrants>;
  readonly last: UseQueryResult<SyncReport | null>;
  readonly syncing: boolean;
  readonly busy: HealthConnectAction | null;
  readonly connect: () => void;
  readonly syncNow: () => void;
}

function useSyncing(): boolean {
  return useValue(syncingNow);
}

function useDeviceQuery<T>(part: string, read: () => Promise<T>): UseQueryResult<T> {
  return useScreenQuery({
    queryKey: [...DEVICE_KEY, part],
    queryFn: read,
    enabled: HEALTH_CONNECT_ON_DEVICE,
  });
}

interface HealthConnectActions {
  readonly busy: HealthConnectAction | null;
  readonly run: ActionRunner<HealthConnectAction>;
}

function useActions(refresh: () => void): HealthConnectActions {
  const [busy, setBusy] = useState<HealthConnectAction | null>(null);
  const [run] = useState(() =>
    createActionRunner<HealthConnectAction>({
      setBusy,
      refresh,
      succeeded: (outcome): void => {
        log.info('health.action_succeeded', { tone: outcome.tone });
        notify(outcome);
      },
      failed: (error): void => {
        log.error('health.action_failed', error);
        const text = errorText(error);
        notify({ message: text.title, detail: text.detail, tone: 'critical' });
      },
    }),
  );
  return { busy, run };
}

async function connectAndDeliver(
  server: RelayServer,
  intervalMinutes: number,
  connected: boolean,
): Promise<ActionOutcome> {
  const access = await connectPhone(server, 'Android phone', intervalMinutes, connected);
  if (grantedNothing(access)) {
    return { message: 'No Health Connect access was granted', tone: 'default' };
  }
  await retryHealthConnectWrites();
  await retryHealthConnectEntries();
  return { message: 'Health Connect connected', tone: 'positive' };
}

async function syncAndReport(): Promise<ActionOutcome> {
  await syncPhoneNow();
  return { message: 'Synced', tone: 'positive' };
}

function useConnectionAction(actions: HealthConnectActions): () => void {
  const pref = usePref(PREFS.healthSync);
  const connected = useThisPhoneSource() !== null;
  const server = usePairedServer();
  return (): void => {
    if (server === null) {
      notify({ message: 'Pair this app with your server first', tone: 'critical' });
      return;
    }
    if (pref.status !== 'ready') {
      notify({ message: 'Reset the unreadable background sync setting first', tone: 'critical' });
      return;
    }
    background(
      actions.run('connect', () =>
        connectAndDeliver(server, pref.value.intervalMinutes, connected),
      ),
      'actions.run_failed',
    );
  };
}

function useRefresh(): () => void {
  const client = useQueryClient();
  const refresh = (): void => {
    background(client.invalidateQueries({ queryKey: DEVICE_KEY }), 'queries.invalidate_failed');
  };
  return refresh;
}

export interface SyncControls {
  readonly available: boolean;
  readonly busy: HealthConnectAction | null;
  readonly syncNow: () => void;
}

export function useSyncControls(): SyncControls {
  const refresh = useRefresh();
  const actions = useActions(refresh);
  const status = useDeviceQuery('status', readHealthConnectStatus);
  return {
    available: status.data?.sdk === 'available',
    busy: actions.busy,
    syncNow: (): void => {
      background(actions.run('sync', syncAndReport), 'actions.run_failed');
    },
  };
}

export function useHealthConnect(): HealthConnectControls {
  const refresh = useRefresh();
  const actions = useActions(refresh);
  const connect = useConnectionAction(actions);
  return {
    status: useDeviceQuery('status', readHealthConnectStatus),
    grants: useDeviceQuery('grants', readGrants),
    last: useDeviceQuery('last', readLastSync),
    syncing: useSyncing(),
    busy: actions.busy,
    connect,
    syncNow: (): void => {
      background(actions.run('sync', syncAndReport), 'actions.run_failed');
    },
  };
}
