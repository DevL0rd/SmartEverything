import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { useSettings } from '../../../store/selectors';
import { PREFS, usePref } from '../../../store/prefs';
import { retryHealthConnectWrites } from '../../profiles';
import { retryHealthConnectEntries } from '../../health-log';
import { useThisPhoneSource } from './this-phone';
import {
  HEALTH_CONNECT_ON_DEVICE,
  connectPhone,
  onSyncProgress,
  readGrants,
  readHealthConnectStatus,
  readLastSync,
  syncPhoneNow,
  type HealthConnectGrants,
  type HealthConnectStatus,
  type SyncReport,
} from './health-connect';

const DEVICE_KEY = ['device', 'health-connect'] as const;
const PROGRESS_SETTLE_MS = 2500;

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

function useSyncing(onSettled: () => void): boolean {
  const [syncing, setSyncing] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!HEALTH_CONNECT_ON_DEVICE) {
      return undefined;
    }
    const subscription = onSyncProgress(() => {
      setSyncing(true);
      if (settle.current !== null) {
        clearTimeout(settle.current);
      }
      settle.current = setTimeout(() => {
        setSyncing(false);
        onSettled();
      }, PROGRESS_SETTLE_MS);
    });
    return (): void => {
      subscription.remove();
      if (settle.current !== null) {
        clearTimeout(settle.current);
      }
    };
  }, [onSettled]);
  return syncing;
}

function useDeviceQuery<T>(part: string, read: () => Promise<T>): UseQueryResult<T> {
  return useQuery({
    queryKey: [...DEVICE_KEY, part],
    queryFn: read,
    enabled: HEALTH_CONNECT_ON_DEVICE,
  });
}

interface HealthConnectActions {
  readonly busy: HealthConnectAction | null;
  readonly run: (action: HealthConnectAction, work: () => Promise<unknown>, done: string) => void;
}

function useActions(refresh: () => void): HealthConnectActions {
  const [busy, setBusy] = useState<HealthConnectAction | null>(null);
  const running = useRef(false);
  const run = (action: HealthConnectAction, work: () => Promise<unknown>, done: string): void => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(action);
    work().then(
      () => {
        running.current = false;
        setBusy(null);
        notify({ message: done, tone: 'positive' });
        refresh();
      },
      (error: unknown) => {
        running.current = false;
        setBusy(null);
        const text = errorText(error);
        notify({ message: text.title, detail: text.detail, tone: 'critical' });
        refresh();
      },
    );
  };
  return { busy, run };
}

async function connectAndDeliver(
  publicUrl: string | null,
  intervalMinutes: number,
  connected: boolean,
): Promise<void> {
  const access = await connectPhone('Android phone', publicUrl, intervalMinutes, connected);
  if (access.types.length === 0 && access.writeTypes?.length === 0) {
    return;
  }
  await retryHealthConnectWrites();
  await retryHealthConnectEntries();
}

function useConnectionAction(actions: HealthConnectActions): () => void {
  const publicUrl = useSettings().public_url;
  const pref = usePref(PREFS.healthSync);
  const connected = useThisPhoneSource() !== null;
  return (): void => {
    if (pref.status !== 'ready') {
      notify({ message: 'Reset the unreadable background sync setting first', tone: 'critical' });
      return;
    }
    actions.run(
      'connect',
      () => connectAndDeliver(publicUrl, pref.value.intervalMinutes, connected),
      'Health Connect access reviewed',
    );
  };
}

export function useHealthConnect(): HealthConnectControls {
  const client = useQueryClient();
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: DEVICE_KEY });
  };
  const actions = useActions(refresh);
  const connect = useConnectionAction(actions);
  return {
    status: useDeviceQuery('status', readHealthConnectStatus),
    grants: useDeviceQuery('grants', readGrants),
    last: useDeviceQuery('last', readLastSync),
    syncing: useSyncing(refresh),
    busy: actions.busy,
    connect,
    syncNow: (): void => {
      actions.run('sync', syncPhoneNow, 'Synced');
    },
  };
}
