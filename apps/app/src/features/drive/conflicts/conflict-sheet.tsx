import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveConflict } from '@smarteverything/domain';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useDriveItem } from '../data';
import { fileNameOf } from '../model/file-name';
import { ConflictActions } from './conflict-actions';
import { COMPARE_LABEL, KEEP_NOTE, copyWellsOf, sentenceOf, type CopyWell } from './conflict-model';
import { useConflictFacts } from './use-conflict-sides';

const SHEET_DETENTS = ['fit'] as const;

function Well({ well }: { readonly well: CopyWell }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1 rounded-md bg-surface-2 p-3">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {well.title}
      </Text>
      <Text variant="body-strong" numberOfLines={1}>
        {well.name}
      </Text>
      {well.detail === '' ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
          {well.detail}
        </Text>
      )}
    </View>
  );
}

function SheetBody({
  conflict,
  onClose,
  onCompare,
}: {
  readonly conflict: DriveConflict;
  readonly onClose: () => void;
  readonly onCompare: (conflict: DriveConflict) => void;
}): ReactNode {
  const facts = useConflictFacts(conflict);
  const copy = useDriveItem(conflict.conflictItemId, conflict.rootId).data ?? null;
  const time = { now: useMinute(), zone: useSettings().time_zone };
  const [hub, client] = copyWellsOf({ ...facts, conflict, copy, time });
  return (
    <View className="gap-4 px-4 pb-6">
      <View className="flex-row items-center gap-3">
        <IconWell icon="warning" colour="warning" />
        <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
          {fileNameOf(conflict.relPath)}
        </Text>
      </View>
      <Text variant="body" tone="variant">
        {`${sentenceOf(facts.sides)}.`}
      </Text>
      <View className="flex-row gap-2">
        <Well well={hub} />
        <Well well={client} />
      </View>
      <ConflictActions
        conflict={conflict}
        sides={facts.sides}
        pointer={false}
        onResolved={onClose}
      />
      <Button
        label={COMPARE_LABEL}
        variant="text"
        size="lg"
        onPress={() => {
          onCompare(conflict);
        }}
      />
      <Text variant="footnote" tone="variant">
        {KEEP_NOTE}
      </Text>
    </View>
  );
}

export interface ConflictSheetProps {
  readonly conflict: DriveConflict | null;
  readonly onClose: () => void;
  readonly onCompare: (conflict: DriveConflict) => void;
}

export function ConflictSheet({ conflict, onClose, onCompare }: ConflictSheetProps): ReactNode {
  return (
    <BottomSheet
      open={conflict !== null}
      onClose={onClose}
      label="Sync conflict"
      detents={SHEET_DETENTS}
    >
      {conflict === null ? null : (
        <SheetBody key={conflict.id} conflict={conflict} onClose={onClose} onCompare={onCompare} />
      )}
    </BottomSheet>
  );
}
