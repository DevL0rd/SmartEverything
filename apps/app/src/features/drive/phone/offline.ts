import { useEffect, useState } from 'react';
import type { DriveOfflineSet } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DriveOfflineStatus } from '../../../../modules/health-connect';
import { setDriveOffline } from '../../../api/drive';
import { errorFields } from '../../../design/log-tally';
import { useSession } from '../../../store/selectors';
import type { RowOf } from '../../../store/state';
import { useDriveOfflineRows, useOfflineSet } from '../data';
import { nativeDriveProvider, type DriveProviderLink } from './provider';

const log = new Logger('app.drive');

export type OfflineRow = RowOf<'drive_offline_items'>;

export function offlineRowOf(
  rows: readonly OfflineRow[],
  clientId: string,
  itemId: string,
): OfflineRow | null {
  return rows.find((row) => row.clientId === clientId && row.itemId === itemId) ?? null;
}

export function pinnedRowsOf(rows: readonly OfflineRow[], clientId: string): readonly OfflineRow[] {
  return rows.filter((row) => row.clientId === clientId);
}

export function offlineBody(clientId: string, itemId: string, on: boolean): DriveOfflineSet {
  return { clientId, itemId, on };
}

export async function removeAllOffline(
  link: DriveProviderLink,
  rows: readonly OfflineRow[],
  clientId: string,
  unpin: (body: DriveOfflineSet) => Promise<unknown> = setDriveOffline,
): Promise<number> {
  const pinned = pinnedRowsOf(rows, clientId);
  for (const row of pinned) await unpin(offlineBody(clientId, row.itemId, false));
  await link.offlineClear();
  return pinned.length;
}

export interface OfflinePin {
  readonly available: boolean;
  readonly row: OfflineRow | null;
  readonly pinned: boolean;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly toggle: () => void;
}

export function useOfflinePin(
  itemId: string,
  link: DriveProviderLink = nativeDriveProvider,
): OfflinePin {
  const clientId = useSession().client.id;
  const rows = useDriveOfflineRows();
  const set = useOfflineSet();
  const row = offlineRowOf(rows, clientId, itemId);
  return {
    available: link.linked(),
    row,
    pinned: row !== null,
    busy: set.busy,
    problem: set.problem,
    toggle: (): void => {
      set.run(offlineBody(clientId, itemId, row === null));
    },
  };
}

export interface PhoneStorage {
  readonly available: boolean;
  readonly status: DriveOfflineStatus | null;
  readonly rows: readonly OfflineRow[];
  readonly clearing: boolean;
  readonly removeAll: () => void;
  readonly syncNow: () => void;
}

export function usePhoneStorage(link: DriveProviderLink = nativeDriveProvider): PhoneStorage {
  const clientId = useSession().client.id;
  const rows = pinnedRowsOf(useDriveOfflineRows(), clientId);
  const [status, setStatus] = useState<DriveOfflineStatus | null>(null);
  const [clearing, setClearing] = useState(false);
  const available = link.linked();
  const signature = rows.map((row) => `${row.itemId}:${row.state}:${String(row.bytes)}`).join('|');
  useEffect(() => {
    if (!available) return;
    let current = true;
    link.offlineStatus().then(
      (next) => {
        if (current) setStatus(next);
      },
      (error: unknown) => {
        log.warn('drive.offline_status_failed', errorFields(error));
      },
    );
    return (): void => {
      current = false;
    };
  }, [link, available, signature]);
  return {
    available,
    status,
    rows,
    clearing,
    removeAll: (): void => {
      setClearing(true);
      removeAllOffline(link, rows, clientId).then(
        () => {
          setClearing(false);
          setStatus(null);
        },
        (error: unknown) => {
          setClearing(false);
          log.warn('drive.offline_clear_failed', errorFields(error));
        },
      );
    },
    syncNow: (): void => {
      link.offlineSync().catch((error: unknown) => {
        log.warn('drive.offline_sync_failed', errorFields(error));
      });
    },
  };
}
