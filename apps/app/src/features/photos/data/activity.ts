import { useMemo } from 'react';
import { useValue } from '../../../design/external-store';
import { driveProgress, type DriveProgress } from '../../nas/data/progress';

export interface PhotosActivity {
  readonly done: number;
  readonly total: number;
}

export function activityOf(progress: DriveProgress): PhotosActivity | null {
  let done = 0;
  let total = 0;
  for (const root of Object.values(progress)) {
    for (const phase of [root.scan, root.hash]) {
      if (phase === undefined) continue;
      done += phase.done;
      total += phase.total;
    }
  }
  return total === 0 ? null : { done, total };
}

export function usePhotosActivity(): PhotosActivity | null {
  const progress = useValue(driveProgress);
  return useMemo(() => activityOf(progress), [progress]);
}
