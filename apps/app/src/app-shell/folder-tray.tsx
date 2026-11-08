import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../components/bottom-sheet';
import { Text } from '../components/text';
import { NavRow } from './nav-row';
import type { NavEntry, NavFolderView } from './nav-model';

export interface FolderTrayProps {
  readonly folder: NavFolderView;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
  readonly onClose: () => void;
}

function TrayRows({
  folder,
  go,
  intent,
  onClose,
}: Pick<FolderTrayProps, 'folder' | 'go' | 'intent' | 'onClose'>): ReactNode {
  if (folder.items.length === 0) {
    return (
      <View className="h-12 justify-center px-4">
        <Text variant="callout" tone="variant">
          This folder is empty
        </Text>
      </View>
    );
  }
  return (
    <View>
      {folder.items.map((entry) => (
        <NavRow
          key={entry.key}
          entry={entry}
          onPress={() => {
            onClose();
            go(entry);
          }}
          onIntent={() => {
            intent(entry);
          }}
        />
      ))}
    </View>
  );
}

export function FolderTray(props: FolderTrayProps): ReactNode {
  const { folder, onClose } = props;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={folder.title}
      label={folder.title}
      detents={['fit']}
      compact
    >
      <TrayRows {...props} />
    </BottomSheet>
  );
}
