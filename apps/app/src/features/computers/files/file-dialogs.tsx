import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Sheet } from '../../../components/sheet';
import { FilePreview } from './file-preview';
import { baseName, parentOf, joinPath } from './file-model';
import { PathField } from './folder-fields';
import { FolderPickerSheet } from './folder-picker-sheet';
import { NameSheet } from './name-sheet';
import { PropertiesSheet } from './properties-sheet';
import type { FileEntry } from '@smarteverything/domain';
import type { FileActions } from './use-file-actions';

interface Shared {
  readonly deviceId: string;
  readonly machine: string;
  readonly folder: string;
  readonly actions: FileActions;
  readonly onGo: (path: string) => void;
}

function Rename({
  entry,
  folder,
  actions,
}: Pick<Shared, 'folder' | 'actions'> & { readonly entry: FileEntry }): ReactNode {
  return (
    <NameSheet
      key={entry.path}
      title="Rename"
      label="Name"
      initial={entry.name}
      helper={`In ${folder}`}
      confirmLabel="Rename"
      onSubmit={(name) => {
        background(
          actions.ops.run({ action: 'rename', path: entry.path, name }),
          'files.rename_failed',
        );
      }}
      onClose={actions.close}
    />
  );
}

function NewFolder({ folder, actions }: Pick<Shared, 'folder' | 'actions'>): ReactNode {
  return (
    <NameSheet
      title="New folder"
      label="Folder name"
      initial=""
      helper={`Created inside ${folder}`}
      confirmLabel="Create"
      onSubmit={(name) => {
        background(
          actions.ops.run({ action: 'new_folder', path: joinPath(folder, name) }),
          'files.new_folder_failed',
        );
      }}
      onClose={actions.close}
    />
  );
}

function EnterPath({
  machine,
  actions,
  onGo,
}: Pick<Shared, 'machine' | 'actions' | 'onGo'>): ReactNode {
  return (
    <Sheet open onClose={actions.close} title="Enter path" detents={['half']}>
      <View className="px-4 pb-6">
        <PathField
          machine={machine}
          onGo={(path) => {
            onGo(path);
            actions.close();
          }}
        />
      </View>
    </Sheet>
  );
}

function Transfer({
  deviceId,
  entries,
  mode,
  actions,
}: Pick<Shared, 'deviceId' | 'actions'> & {
  readonly entries: readonly FileEntry[];
  readonly mode: 'move' | 'copy';
}): ReactNode {
  return (
    <FolderPickerSheet
      open
      mode="folder"
      deviceId={deviceId}
      start={parentOf(entries[0]?.path ?? '/')}
      onClose={actions.close}
      onChoose={(to) => {
        background(
          actions.ops.run({
            action: mode,
            paths: entries.map((entry) => entry.path),
            to,
            replace: false,
          }),
          'files.transfer_failed',
        );
      }}
    />
  );
}

export function FileDialogs(shared: Shared): ReactNode {
  const { deviceId, machine, folder, actions, onGo } = shared;
  const { dialog } = actions;
  switch (dialog.kind) {
    case 'none':
      return null;
    case 'preview':
      return (
        <FilePreview
          deviceId={deviceId}
          path={dialog.path}
          onClose={actions.close}
          onDownload={() => {
            actions.close();
            actions.download([{ path: dialog.path, name: baseName(dialog.path), kind: 'file' }]);
          }}
        />
      );
    case 'properties':
      return <PropertiesSheet deviceId={deviceId} entry={dialog.entry} onClose={actions.close} />;
    case 'rename':
      return <Rename entry={dialog.entry} folder={folder} actions={actions} />;
    case 'folder':
      return <NewFolder folder={folder} actions={actions} />;
    case 'path':
      return <EnterPath machine={machine} actions={actions} onGo={onGo} />;
    case 'transfer':
      return (
        <Transfer
          deviceId={deviceId}
          entries={dialog.entries}
          mode={dialog.mode}
          actions={actions}
        />
      );
  }
}
