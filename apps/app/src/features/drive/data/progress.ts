import type { DriveProgressNotice } from '@smarteverything/domain';
import { ValueStore, usePausable } from '../../../design/external-store';

type Phase = DriveProgressNotice['phase'];

export interface PhaseProgress {
  readonly done: number;
  readonly total: number;
}

export type RootProgress = Readonly<Partial<Record<Phase, PhaseProgress>>>;

export type DriveProgress = Readonly<Record<string, RootProgress>>;

const NONE: DriveProgress = {};

function without<T>(
  record: Readonly<Record<string, T>>,
  drop: string,
): Readonly<Record<string, T>> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== drop));
}

export function progressAfter(current: DriveProgress, notice: DriveProgressNotice): DriveProgress {
  const root = current[notice.rootId] ?? {};
  const next: RootProgress =
    notice.done >= notice.total
      ? without(root, notice.phase)
      : { ...root, [notice.phase]: { done: notice.done, total: notice.total } };
  return Object.keys(next).length === 0
    ? without(current, notice.rootId)
    : { ...current, [notice.rootId]: next };
}

export const driveProgress = new ValueStore<DriveProgress>(NONE);

export function receiveDriveProgress(notice: DriveProgressNotice): void {
  driveProgress.update((current) => progressAfter(current, notice));
}

export function clearDriveProgress(): void {
  driveProgress.set(NONE);
}

export function useRootProgress(rootId: string): RootProgress | undefined {
  return usePausable(driveProgress.subscribe, () => driveProgress.get()[rootId]);
}

export function useAnyDriveProgress(): boolean {
  return usePausable(driveProgress.subscribe, () => Object.keys(driveProgress.get()).length > 0);
}
