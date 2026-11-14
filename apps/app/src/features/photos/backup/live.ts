import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PhotosProgressNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { onPhotosProgress } from '../../drive';
import { photoKeys } from '../data';
import { NO_PROGRESS, progressAfter, type LiveProgress } from './phones-model';

function settled(client: QueryClient, notice: PhotosProgressNotice): void {
  if (notice.done !== notice.total) return;
  const queryKey = notice.kind === 'backup' ? photoKeys.backup() : photoKeys.processing();
  background(client.invalidateQueries({ queryKey }), 'queries.invalidate_failed');
}

export function useLiveProgress(): LiveProgress {
  const client = useQueryClient();
  const [progress, setProgress] = useState<LiveProgress>(NO_PROGRESS);
  useEffect(
    () =>
      onPhotosProgress((notice) => {
        setProgress((current) => progressAfter(current, notice));
        settled(client, notice);
      }),
    [client],
  );
  return progress;
}
