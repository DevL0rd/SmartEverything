import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { NewFolderField, PathField } from './folder-fields';
import type { PickerMode } from './path-model';

type Extra = 'none' | 'path' | 'folder';

export interface FolderFooterProps {
  readonly mode: PickerMode;
  readonly machine: string;
  readonly folder: string | null;
  readonly picked: string | null;
  readonly usable: boolean;
  readonly canCreate: boolean;
  readonly onChoose: () => void;
  readonly onGo: (path: string) => void;
  readonly onCreate: (parent: string, name: string) => void;
  readonly onCancel: (() => void) | undefined;
}

function summary(mode: PickerMode, folder: string | null, picked: string | null): string {
  if (mode === 'folder') return folder === null ? 'Reading the folder…' : `Choosing ${folder}`;
  return picked === null ? 'Select a file' : `Choosing ${picked}`;
}

function ExtraField({
  extra,
  footer,
  onClose,
}: {
  readonly extra: Extra;
  readonly footer: FolderFooterProps;
  readonly onClose: () => void;
}): ReactNode {
  if (extra === 'path') {
    return (
      <PathField
        machine={footer.machine}
        onGo={(path) => {
          footer.onGo(path);
          onClose();
        }}
      />
    );
  }
  const { folder } = footer;
  if (extra === 'folder' && folder !== null) {
    return (
      <NewFolderField
        folder={folder}
        onCreate={(name) => {
          footer.onCreate(folder, name);
          onClose();
        }}
      />
    );
  }
  return null;
}

function Actions({
  footer,
  extra,
  onToggle,
}: {
  readonly footer: FolderFooterProps;
  readonly extra: Extra;
  readonly onToggle: (next: Extra) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {footer.mode === 'folder' && footer.canCreate ? (
        <Button
          label="New folder"
          variant="outlined"
          icon="plus"
          disabled={!footer.usable}
          onPress={() => {
            onToggle('folder');
          }}
        />
      ) : null}
      <Button
        label={extra === 'path' ? 'Browse' : 'Enter path'}
        variant="text"
        onPress={() => {
          onToggle('path');
        }}
      />
      {footer.onCancel === undefined ? null : (
        <Button label="Cancel" variant="text" onPress={footer.onCancel} />
      )}
    </View>
  );
}

export function FolderFooter(props: FolderFooterProps): ReactNode {
  const { mode, folder, picked, usable } = props;
  const [extra, setExtra] = useState<Extra>('none');
  return (
    <View className="gap-2 border-t border-outline-variant px-4 pb-3 pt-2.5">
      <Text variant="footnote" tone="variant" numberOfLines={2} selectable>
        {summary(mode, folder, picked)}
      </Text>
      <ExtraField
        key={extra}
        extra={extra}
        footer={props}
        onClose={() => {
          setExtra('none');
        }}
      />
      <Button
        label={mode === 'folder' ? 'Choose this folder' : 'Choose file'}
        size="lg"
        grow
        disabled={!usable || (mode === 'file' && picked === null)}
        onPress={props.onChoose}
      />
      <Actions
        footer={props}
        extra={extra}
        onToggle={(next) => {
          setExtra(extra === next ? 'none' : next);
        }}
      />
    </View>
  );
}
