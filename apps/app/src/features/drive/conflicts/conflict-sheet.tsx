import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveConflict } from '@smarteverything/domain';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { DialogFrame } from '../../../components/dialog-frame';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useDriveItem } from '../data';
import { useByName } from '../components/use-by-name';
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
      {well.name === '' ? null : (
        <Text variant="body-strong" numberOfLines={1}>
          {well.name}
        </Text>
      )}
      {well.detail === '' ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
          {well.detail}
        </Text>
      )}
    </View>
  );
}

interface BodyProps {
  readonly conflict: DriveConflict;
  readonly onClose: () => void;
  readonly onCompare: (conflict: DriveConflict) => void;
}

function useWells(conflict: DriveConflict): {
  readonly facts: ReturnType<typeof useConflictFacts>;
  readonly wells: readonly [CopyWell, CopyWell];
} {
  const facts = useConflictFacts(conflict);
  const copy = useDriveItem(conflict.conflictItemId, conflict.rootId).data ?? null;
  const time = { now: useMinute(), zone: useSettings().time_zone };
  const copyMaker = useByName()(copy === null ? null : copy.addedByProfileId);
  return { facts, wells: copyWellsOf({ ...facts, conflict, copy, copyMaker, time }) };
}

function Summary({
  sentence,
  wells,
}: {
  readonly sentence: string;
  readonly wells: readonly [CopyWell, CopyWell];
}): ReactNode {
  return (
    <>
      <Text variant="body" tone="variant">
        {`${sentence}.`}
      </Text>
      <View className="flex-row gap-2">
        <Well well={wells[0]} />
        <Well well={wells[1]} />
      </View>
    </>
  );
}

function CompareButton({
  conflict,
  pointer,
  onCompare,
}: Pick<BodyProps, 'conflict' | 'onCompare'> & { readonly pointer: boolean }): ReactNode {
  return (
    <Button
      label={COMPARE_LABEL}
      icon="git-compare-arrows"
      variant="text"
      size={pointer ? 'md' : 'lg'}
      onPress={() => {
        onCompare(conflict);
      }}
    />
  );
}

function TouchBody({ conflict, onClose, onCompare }: BodyProps): ReactNode {
  const { facts, wells } = useWells(conflict);
  return (
    <View className="gap-4 px-4 pb-6">
      <View className="flex-row items-center gap-3">
        <IconWell icon="warning" colour="warning" />
        <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
          {fileNameOf(conflict.relPath)}
        </Text>
      </View>
      <Summary sentence={sentenceOf(facts.sides)} wells={wells} />
      <ConflictActions
        conflict={conflict}
        sides={facts.sides}
        pointer={false}
        onResolved={onClose}
      />
      <CompareButton conflict={conflict} pointer={false} onCompare={onCompare} />
      <Text variant="footnote" tone="variant">
        {KEEP_NOTE}
      </Text>
    </View>
  );
}

function PointerBody({ conflict, onClose, onCompare }: BodyProps): ReactNode {
  const { facts, wells } = useWells(conflict);
  return (
    <View className="gap-4">
      <Summary sentence={sentenceOf(facts.sides)} wells={wells} />
      <Text variant="footnote" tone="variant">
        {KEEP_NOTE}
      </Text>
      <View className="flex-row flex-wrap items-center justify-end gap-2">
        <CompareButton conflict={conflict} pointer onCompare={onCompare} />
        <ConflictActions conflict={conflict} sides={facts.sides} pointer onResolved={onClose} />
      </View>
    </View>
  );
}

export interface ConflictSheetProps {
  readonly conflict: DriveConflict | null;
  readonly onClose: () => void;
  readonly onCompare: (conflict: DriveConflict) => void;
}

export function ConflictSheet({ conflict, onClose, onCompare }: ConflictSheetProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  if (pointer) {
    return (
      <DialogFrame
        open={conflict !== null}
        onClose={onClose}
        label="Sync conflict"
        title={conflict === null ? 'Sync conflict' : fileNameOf(conflict.relPath)}
        kind="dialog"
        wide
      >
        {conflict === null ? null : (
          <PointerBody
            key={conflict.id}
            conflict={conflict}
            onClose={onClose}
            onCompare={onCompare}
          />
        )}
      </DialogFrame>
    );
  }
  return (
    <BottomSheet
      open={conflict !== null}
      onClose={onClose}
      label="Sync conflict"
      detents={SHEET_DETENTS}
    >
      {conflict === null ? null : (
        <TouchBody key={conflict.id} conflict={conflict} onClose={onClose} onCompare={onCompare} />
      )}
    </BottomSheet>
  );
}
