import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { HealthRecordType } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { useSettings } from '../../../store/selectors';
import {
  HEALTH_CONNECT_ON_DEVICE,
  askForAccess,
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

type HealthConnectAction = 'connect' | 'sync' | 'permissions';

export interface HealthConnectControls {
  readonly status: UseQueryResult<HealthConnectStatus>;
  readonly grants: UseQueryResult<HealthConnectGrants>;
  readonly last: UseQueryResult<SyncReport | null>;
  readonly syncing: boolean;
  readonly busy: HealthConnectAction | null;
  readonly connect: () => void;
  readonly syncNow: () => void;
  readonly askAgain: (types: readonly HealthRecordType[]) => void;
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

export function useHealthConnect(): HealthConnectControls {
  const client = useQueryClient();
  const publicUrl = useSettings().public_url;
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: DEVICE_KEY });
  };
  const status = useDeviceQuery('status', readHealthConnectStatus);
  const grants = useDeviceQuery('grants', readGrants);
  const last = useDeviceQuery('last', readLastSync);
  const syncing = useSyncing(refresh);
  const [busy, setBusy] = useState<HealthConnectAction | null>(null);
  const run = (action: HealthConnectAction, work: () => Promise<unknown>, done: string): void => {
    setBusy(action);
    work().then(
      () => {
        setBusy(null);
        notify({ message: done, tone: 'positive' });
        refresh();
      },
      (error: unknown) => {
        setBusy(null);
        const text = errorText(error);
        notify({ message: text.title, detail: text.detail, tone: 'critical' });
      },
    );
  };
  return {
    status,
    grants,
    last,
    syncing,
    busy,
    connect: (): void => {
      run('connect', () => connectPhone('Android phone', publicUrl), 'Health Connect connected');
    },
    syncNow: (): void => {
      run('sync', syncPhoneNow, 'Synced');
    },
    askAgain: (types): void => {
      run('permissions', () => askForAccess(types), 'Permissions updated');
    },
  };
}
