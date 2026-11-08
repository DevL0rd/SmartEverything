import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { DriveConflict, DriveConflictResolution } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { cn } from '../../../design/cn';
import { useSyncStatus } from '../../../store/selectors';
import { conflictActionsOf, type ConflictSides } from './conflict-model';
import { resolveConflict } from './resolve';

interface Resolving {
  readonly busy: DriveConflictResolution | null;
  readonly run: (resolution: DriveConflictResolution) => void;
}

function useResolving(
  conflict: DriveConflict,
  sides: ConflictSides,
  onResolved: (() => void) | undefined,
): Resolving {
  const client = useQueryClient();
  const [busy, setBusy] = useState<DriveConflictResolution | null>(null);
  const run = (resolution: DriveConflictResolution): void => {
    if (busy !== null) return;
    setBusy(resolution);
    background(
      resolveConflict(client, { conflict, resolution, sides }).then((settled) => {
        setBusy(null);
        if (settled) onResolved?.();
      }),
      'drive_conflict.resolve_failed',
    );
  };
  return { busy, run };
}

export interface ConflictActionsProps {
  readonly conflict: DriveConflict;
  readonly sides: ConflictSides;
  readonly pointer: boolean;
  readonly onResolved?: () => void;
}

export function ConflictActions({
  conflict,
  sides,
  pointer,
  onResolved,
}: ConflictActionsProps): ReactNode {
  const resolving = useResolving(conflict, sides, onResolved);
  const live = useSyncStatus().status === 'live';
  return (
    <View className={cn(pointer ? 'flex-row flex-wrap items-center justify-end gap-2' : 'gap-2')}>
      {conflictActionsOf(sides, pointer).map((action) => (
        <Button
          key={action.resolution}
          label={action.label}
          variant={action.variant}
          size={pointer ? 'md' : 'lg'}
          wrap={!pointer}
          loading={resolving.busy === action.resolution}
          disabled={!live || (resolving.busy !== null && resolving.busy !== action.resolution)}
          onPress={() => {
            resolving.run(action.resolution);
          }}
        />
      ))}
    </View>
  );
}
