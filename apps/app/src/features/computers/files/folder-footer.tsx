import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { NewFolderField, PathField } from './folder-fields';
import type { PickerMode } from './path-model';

export type FolderExtra = 'none' | 'path' | 'folder';

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
  readonly compact: boolean;
  readonly extra: FolderExtra;
  readonly onExtra: (next: FolderExtra) => void;
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
  readonly extra: FolderExtra;
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

function Actions({ footer }: { readonly footer: FolderFooterProps }): ReactNode {
  const { extra, onExtra } = footer;
  const toggle = (next: FolderExtra): void => {
    onExtra(extra === next ? 'none' : next);
  };
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {footer.mode === 'folder' && footer.canCreate ? (
        <Button
          label="New folder"
          variant="outlined"
          icon="plus"
          disabled={!footer.usable}
          onPress={() => {
            toggle('folder');
          }}
        />
      ) : null}
      <Button
        label={extra === 'path' ? 'Browse' : 'Enter path'}
        variant="text"
        onPress={() => {
          toggle('path');
        }}
      />
      {footer.onCancel === undefined ? null : (
        <Button label="Cancel" variant="text" onPress={footer.onCancel} />
      )}
    </View>
  );
}

function ChooseButton({ footer }: { readonly footer: FolderFooterProps }): ReactNode {
  const { mode, picked, usable, onChoose, compact } = footer;
  return (
    <Button
      label={mode === 'folder' ? (compact ? 'Choose folder' : 'Choose this folder') : 'Choose file'}
      size={compact ? 'md' : 'lg'}
      grow
      disabled={!usable || (mode === 'file' && picked === null)}
      onPress={onChoose}
    />
  );
}

function CompactAction({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      onPress={onPress}
      focusInset
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-md px-2"
    >
      <Text variant="label" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

function CompactActions({ footer }: { readonly footer: FolderFooterProps }): ReactNode {
  const { extra, onExtra, onCancel } = footer;
  return (
    <>
      {footer.mode === 'folder' && footer.canCreate ? (
        <Button
          label="New folder"
          variant="outlined"
          icon="plus"
          disabled={!footer.usable}
          onPress={(): void => {
            onExtra(extra === 'folder' ? 'none' : 'folder');
          }}
        />
      ) : null}
      <View className="flex-row items-center gap-1">
        {onCancel === undefined ? null : <CompactAction label="Cancel" onPress={onCancel} />}
        <CompactAction
          label={extra === 'path' ? 'Browse' : 'Enter path'}
          onPress={(): void => {
            onExtra(extra === 'path' ? 'none' : 'path');
          }}
        />
        <ChooseButton footer={footer} />
      </View>
    </>
  );
}

export function FolderFooter(props: FolderFooterProps): ReactNode {
  const { mode, folder, picked, compact, extra, onExtra } = props;
  return (
    <View
      className={cn(
        'gap-2 border-t border-outline-variant',
        compact ? 'px-1.5 pb-1 pt-2' : 'px-4 pb-3 pt-2.5',
      )}
    >
      <Text variant="footnote" tone="variant" numberOfLines={2} selectable>
        {summary(mode, folder, picked)}
      </Text>
      <ExtraField
        key={extra}
        extra={extra}
        footer={props}
        onClose={() => {
          onExtra('none');
        }}
      />
      {compact ? (
        <CompactActions footer={props} />
      ) : (
        <>
          <ChooseButton footer={props} />
          <Actions footer={props} />
        </>
      )}
    </View>
  );
}
