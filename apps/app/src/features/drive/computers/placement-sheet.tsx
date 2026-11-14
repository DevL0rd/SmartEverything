import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DrivePlacementMode } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { FolderPickerSheet } from '../../computers';
import { placementBodyOf } from '../model/placement-body';
import { DriveFolderTree, type PickedFolder } from './drive-folder-tree';
import { usePlacementWrites } from './placement-change';
import { childPath } from './placement-model';
import { MODE_ICON } from './placement-words';

export interface PlacementSheetTarget {
  readonly deviceId: string;
  readonly computer: string;
  readonly mode: DrivePlacementMode;
}

const MODE_OPTIONS = [
  { value: 'synced', label: 'Sync', icon: MODE_ICON.synced },
  { value: 'mounted', label: 'Mount', icon: MODE_ICON.mounted },
] as const;

const MODE_NOTE: Readonly<Record<DrivePlacementMode, string>> = {
  synced: 'Keeps a full copy on the computer that works offline, like Syncthing.',
  mounted: 'Opens files from the Hub as you use them and keeps only what you read.',
};

export function localPathOf(parent: string | null, picked: PickedFolder | null): string | null {
  return parent === null || picked === null ? null : childPath(parent, picked.name);
}

function LocalFolder({
  deviceId,
  computer,
  path,
  onChoose,
}: {
  readonly deviceId: string;
  readonly computer: string;
  readonly path: string | null;
  readonly onChoose: (parent: string) => void;
}): ReactNode {
  const [choosing, setChoosing] = useState(false);
  return (
    <>
      <ListRow
        title={`Where on ${computer}`}
        subtitle={path ?? 'Choose a folder on the computer'}
        icon="folder"
        trailing={
          <Button
            label="Choose"
            variant="tonal"
            onPress={() => {
              setChoosing(true);
            }}
          />
        }
      />
      <FolderPickerSheet
        open={choosing}
        mode="folder"
        deviceId={deviceId}
        onClose={() => {
          setChoosing(false);
        }}
        onChoose={onChoose}
      />
    </>
  );
}

function Notes({
  readOnly,
  problem,
}: {
  readonly readOnly: boolean;
  readonly problem: string | null;
}): ReactNode {
  return (
    <>
      {readOnly ? (
        <Text variant="footnote" tone="variant">
          You can view this folder, so it stays read only on the computer.
        </Text>
      ) : null}
      {problem === null ? null : (
        <Text variant="footnote" tone="critical">
          {problem}
        </Text>
      )}
    </>
  );
}

function Footer({
  ready,
  busy,
  onCancel,
  onDone,
}: {
  readonly ready: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onDone: () => void;
}): ReactNode {
  return (
    <View className="ml-auto flex-row flex-wrap justify-end gap-2">
      <Button label="Cancel" variant="tonal" disabled={busy} onPress={onCancel} />
      <Button label="Done" loading={busy} disabled={!ready || busy} onPress={onDone} />
    </View>
  );
}

function SheetBody({
  target,
  onClose,
}: {
  readonly target: PlacementSheetTarget;
  readonly onClose: () => void;
}): ReactNode {
  const [mode, setMode] = useState(target.mode);
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const writes = usePlacementWrites();
  const localPath = localPathOf(parent, picked);
  const done = (): void => {
    if (picked === null || localPath === null) return;
    const body = placementBodyOf({
      deviceId: target.deviceId,
      target: { rootId: picked.rootId, folderItemId: picked.folderItemId },
      mode,
      localPath,
    });
    writes.set([body], `${picked.name} was not put on ${target.computer}`, onClose);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'synced' ? 'Sync a folder' : 'Mount a folder'}
      wide
      footer={
        <Footer ready={localPath !== null} busy={writes.busy} onCancel={onClose} onDone={done} />
      }
    >
      <View className="gap-4">
        <Segmented label="How" options={MODE_OPTIONS} value={mode} onChange={setMode} fill />
        <Text variant="footnote" tone="variant">
          {MODE_NOTE[mode]}
        </Text>
        <DriveFolderTree picked={picked} onPick={setPicked} />
        <Notes readOnly={picked?.readOnly === true} problem={writes.problem} />
        <LocalFolder
          deviceId={target.deviceId}
          computer={target.computer}
          path={localPath ?? parent}
          onChoose={setParent}
        />
      </View>
    </Sheet>
  );
}

export function PlacementSheet({
  target,
  onClose,
}: {
  readonly target: PlacementSheetTarget | null;
  readonly onClose: () => void;
}): ReactNode {
  return target === null ? null : <SheetBody target={target} onClose={onClose} />;
}
