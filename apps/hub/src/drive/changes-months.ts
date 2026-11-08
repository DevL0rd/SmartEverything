import type { DriveItem } from '@smarteverything/domain';

export function takenMonths(items: readonly DriveItem[]): readonly string[] {
  const months = new Set<string>();
  for (const item of items) {
    if ((item.kind === 'image' || item.kind === 'video') && item.takenAt !== null) {
      months.add(new Date(item.takenAt).toISOString().slice(0, 7));
    }
  }
  return [...months].sort();
}
