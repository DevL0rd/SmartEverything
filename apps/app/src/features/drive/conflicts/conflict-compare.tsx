import type { ReactNode } from 'react';
import { useEffect, useEffectEvent } from 'react';
import type { DriveConflict } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useDriveItem, useDriveRoots } from '../data';
import { VersionsSheet, type VersionsSlots, type VersionsTarget } from '../versions/versions-sheet';
import { ConflictBanner } from './conflict-banner';
import { comparePicksOf, compareNamesOf } from './conflict-model';
import { useConflictFacts } from './use-conflict-sides';

export const COPY_UNREADABLE = 'The other computer’s copy could not be read.';

export interface ConflictCompareProps {
  readonly conflict: DriveConflict;
  readonly onClose: () => void;
}

function useTarget(conflict: DriveConflict, onClose: () => void): VersionsTarget | null {
  const root = useDriveRoots().find((one) => one.id === conflict.rootId) ?? null;
  const { item, versions, settled, sides } = useConflictFacts(conflict);
  const copy = useDriveItem(conflict.conflictItemId, conflict.rootId);
  const failed = useEffectEvent((error: unknown) => {
    notify({ message: COPY_UNREADABLE, error, tone: 'critical' });
    onClose();
  });
  useEffect(() => {
    if (copy.isError) failed(copy.error);
  }, [copy.isError, copy.error]);
  if (item === null || !settled || copy.data === undefined) return null;
  const versionsKept = root === null ? null : root.versions;
  const versus = { copy: copy.data, deviceId: conflict.deviceId, names: compareNamesOf(sides) };
  const picks = comparePicksOf(conflict, item, versions);
  return picks === null ? { versionsKept, item, versus } : { versionsKept, item, picks, versus };
}

function bannerSlotOf(onClose: () => void): NonNullable<VersionsSlots['conflict']> {
  return function ConflictSlot(open: DriveConflict): ReactNode {
    return <ConflictBanner conflict={open} onResolved={onClose} />;
  };
}

export function ConflictCompare({ conflict, onClose }: ConflictCompareProps): ReactNode {
  const target = useTarget(conflict, onClose);
  return (
    <VersionsSheet target={target} onClose={onClose} slots={{ conflict: bannerSlotOf(onClose) }} />
  );
}
