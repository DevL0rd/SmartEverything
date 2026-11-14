import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveFolderPlace } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { chooseUploads } from '../upload';
import type { FolderCommands } from './folder-header';
import type { KindFilter } from './folder-model';

export type EmptyPlace = 'mine' | 'home' | 'folder';

export interface EmptyCopy {
  readonly icon: 'folder' | 'hardDrive' | 'users';
  readonly title: string;
  readonly body: string;
  readonly folderAction: boolean;
}

export function emptyCopyOf(place: EmptyPlace, kind: KindFilter, writable: boolean): EmptyCopy {
  if (kind !== 'all') {
    return {
      icon: 'folder',
      title: 'Nothing of this kind here',
      body: 'Pick another kind above to see the rest of this folder.',
      folderAction: false,
    };
  }
  switch (place) {
    case 'mine':
      return {
        icon: 'hardDrive',
        title: 'Your drive is empty',
        body: 'Files you add here are only yours until you share them.',
        folderAction: true,
      };
    case 'home':
      return {
        icon: 'users',
        title: 'Nothing in the Shared Drive yet',
        body: 'Put things here that the whole home uses.',
        folderAction: true,
      };
    case 'folder':
      return {
        icon: 'folder',
        title: 'This folder is empty',
        body: writable ? 'Upload files or drop them here.' : 'Nothing has been added here yet.',
        folderAction: false,
      };
  }
}

export function EmptyFolder({
  copy,
  actions,
}: {
  readonly copy: EmptyCopy;
  readonly actions: ReactNode;
}): ReactNode {
  return <EmptyState icon={copy.icon} title={copy.title} body={copy.body} action={actions} />;
}

export function EmptyActions({ commands }: { readonly commands: FolderCommands }): ReactNode {
  if (commands.upload === null && commands.newFolder === null) return null;
  return (
    <View className="flex-row flex-wrap justify-center gap-2">
      {commands.upload === null ? null : (
        <Button label="Upload" icon="upload" onPress={commands.upload} />
      )}
      {commands.newFolder === null ? null : (
        <Button label="New folder" icon="plus" variant="tonal" onPress={commands.newFolder} />
      )}
    </View>
  );
}

const FULL_REASON = 'Your drive is full';

export interface CommandInput {
  readonly target: DriveFolderPlace | null;
  readonly writable: boolean;
  readonly full: boolean;
  readonly newFolder: () => void;
}

const NO_COMMANDS: FolderCommands = { upload: null, newFolder: null, blocked: null };

export function commandsOf({ target, writable, full, newFolder }: CommandInput): FolderCommands {
  if (target === null || !writable) return NO_COMMANDS;
  return {
    upload: full
      ? null
      : (): void => {
          chooseUploads(target);
        },
    newFolder,
    blocked: full ? FULL_REASON : null,
  };
}
