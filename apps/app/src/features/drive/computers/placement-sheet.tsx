import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { ComputerFolderPickerSheet } from '../../computers';
import { DriveFolderPickerSheet, DriveFolderRow } from './drive-folder-field';
import { usePlacementWrites } from './placement-change';
import { childPath, sheetBodyOf, type PickedFolder } from './placement-model';

export interface PlacementSheetTarget {
  readonly deviceId: string;
  readonly computer: string;
}

const SYNC_NOTE =
  'Keeps a full copy of a Drive folder on the computer. It works offline and syncs both ways.';

type Picking = 'drive' | 'local' | null;

export function localPathOf(parent: string | null, picked: PickedFolder | null): string | null {
  return parent === null || picked === null ? null : childPath(parent, picked.name);
}

function LocalFolderRow({
  computer,
  path,
  onChoose,
}: {
  readonly computer: string;
  readonly path: string | null;
  readonly onChoose: () => void;
}): ReactNode {
  return (
    <ListRow
      title={`Folder on ${computer}`}
      subtitle={path ?? `Choose a folder on ${computer}`}
      icon="folder"
      trailing={
        <Button
          label="Choose"
          spoken={`Choose a folder on ${computer}`}
          variant="tonal"
          onPress={onChoose}
        />
      }
    />
  );
}

function Problem({ problem }: { readonly problem: string | null }): ReactNode {
  if (problem === null) return null;
  return (
    <Text variant="footnote" tone="critical">
      {problem}
    </Text>
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

function SheetRows({
  picked,
  computer,
  path,
  problem,
  onPick,
}: {
  readonly picked: PickedFolder | null;
  readonly computer: string;
  readonly path: string | null;
  readonly problem: string | null;
  readonly onPick: (picking: Picking) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="footnote" tone="variant">
        {SYNC_NOTE}
      </Text>
      <View className="-mx-4">
        <DriveFolderRow
          picked={picked}
          onChoose={() => {
            onPick('drive');
          }}
        />
        <LocalFolderRow
          computer={computer}
          path={path}
          onChoose={() => {
            onPick('local');
          }}
        />
      </View>
      <Problem problem={problem} />
    </View>
  );
}

function Pickers({
  picking,
  target,
  onBack,
  onDrive,
  onLocal,
}: {
  readonly picking: Picking;
  readonly target: PlacementSheetTarget;
  readonly onBack: () => void;
  readonly onDrive: (picked: PickedFolder) => void;
  readonly onLocal: (parent: string) => void;
}): ReactNode {
  return (
    <>
      <DriveFolderPickerSheet open={picking === 'drive'} onClose={onBack} onPick={onDrive} />
      <ComputerFolderPickerSheet
        open={picking === 'local'}
        title={`Choose a folder on ${target.computer}`}
        writableOnly
        deviceId={target.deviceId}
        onClose={onBack}
        onChoose={onLocal}
      />
    </>
  );
}

function SheetBody({
  target,
  onClose,
}: {
  readonly target: PlacementSheetTarget;
  readonly onClose: () => void;
}): ReactNode {
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking>(null);
  const writes = usePlacementWrites();
  const localPath = localPathOf(parent, picked);
  const body = sheetBodyOf(target.deviceId, picked, localPath);
  const done = (): void => {
    if (picked === null || body === null) return;
    writes.set([body], `${picked.name} was not put on ${target.computer}`, onClose);
  };
  return (
    <>
      <Sheet
        open={picking === null}
        onClose={onClose}
        title={`Sync a folder to ${target.computer}`}
        detents={['fit']}
        wide
        footer={
          <Footer ready={body !== null} busy={writes.busy} onCancel={onClose} onDone={done} />
        }
      >
        <SheetRows
          picked={picked}
          computer={target.computer}
          path={localPath ?? parent}
          problem={writes.problem}
          onPick={setPicking}
        />
      </Sheet>
      <Pickers
        picking={picking}
        target={target}
        onBack={() => {
          setPicking(null);
        }}
        onDrive={setPicked}
        onLocal={setParent}
      />
    </>
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
