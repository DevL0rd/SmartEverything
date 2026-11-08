import type { ReactNode } from 'react';
import type { DriveConflict } from '@smarteverything/domain';
import { useDriveRoots } from '../../nas/data';
import { VersionsSheet, type VersionsSlots, type VersionsTarget } from '../versions/versions-sheet';
import { ConflictBanner } from './conflict-banner';
import { comparePicksOf } from './conflict-model';
import { useConflictFacts } from './use-conflict-sides';

export interface ConflictCompareProps {
  readonly conflict: DriveConflict;
  readonly onClose: () => void;
  readonly slots?: Omit<VersionsSlots, 'conflict'>;
}

function useTarget(conflict: DriveConflict): VersionsTarget | null {
  const root = useDriveRoots().find((one) => one.id === conflict.rootId) ?? null;
  const { item, versions, settled } = useConflictFacts(conflict);
  if (root === null || item === null || !settled) return null;
  const picks = comparePicksOf(conflict, item, versions);
  return picks === null ? { root, item } : { root, item, picks };
}

function bannerSlotOf(onClose: () => void): NonNullable<VersionsSlots['conflict']> {
  return function ConflictSlot(open: DriveConflict): ReactNode {
    return <ConflictBanner conflict={open} onResolved={onClose} />;
  };
}

export function ConflictCompare({
  conflict,
  onClose,
  slots = {},
}: ConflictCompareProps): ReactNode {
  const target = useTarget(conflict);
  return (
    <VersionsSheet
      target={target}
      onClose={onClose}
      slots={{ ...slots, conflict: bannerSlotOf(onClose) }}
    />
  );
}
