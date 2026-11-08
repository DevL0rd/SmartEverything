import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { refreshDrive } from '../data/refresh';

const log = new Logger('app.drive');

export interface LibraryRefresh {
  readonly refreshing: boolean;
  readonly refresh: () => void;
}

export function useLibraryRefresh(reconcileRootId: string | null): LibraryRefresh {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = (): void => {
    setRefreshing(true);
    refreshDrive(client, reconcileRootId).then(
      () => {
        setRefreshing(false);
      },
      (error: unknown) => {
        log.error('frame.refresh_failed', error, { reconcile: reconcileRootId !== null });
        setRefreshing(false);
      },
    );
  };
  return { refreshing, refresh };
}
