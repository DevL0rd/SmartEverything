import type { SyncthingFolder } from '@smarteverything/domain';

const WHOLE = 100;
const RING_CAP = 94;
const MIN_REMAINING = 0.001;

export function percentOf(item: {
  readonly needBytes: number;
  readonly completionPercent: number;
}): number {
  return item.needBytes > 0 ? Math.min(WHOLE - 1, Math.floor(item.completionPercent)) : WHOLE;
}

export function ringShare(percent: number): number {
  return percent >= WHOLE ? 1 : Math.min(percent, RING_CAP) / WHOLE;
}

export function overallCompletion(folders: readonly SyncthingFolder[]): number | null {
  if (folders.length === 0) {
    return null;
  }
  let need = 0;
  let total = 0;
  for (const folder of folders) {
    if (folder.needBytes > 0) {
      const remaining = Math.max(1 - folder.completionPercent / WHOLE, MIN_REMAINING);
      need += folder.needBytes;
      total += folder.needBytes / remaining;
    }
  }
  return total === 0 ? 1 : 1 - need / total;
}
