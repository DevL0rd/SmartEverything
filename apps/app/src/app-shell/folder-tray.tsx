import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import type { Rect } from '../components/anchor';
import { Popover } from '../components/popover';
import { Text } from '../components/text';
import { NavRow } from './nav-row';
import type { NavEntry, NavFolderView } from './nav-model';

const GUTTER = 16;
const VISIBLE_ROWS = 6;
const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 48;
const BOTTOM_PADDING = 8;

export interface FolderTrayProps {
  readonly folder: NavFolderView;
  readonly anchor: Rect;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
  readonly onClose: () => void;
}

function trayHeightOf(rows: number): number {
  return HEADER_HEIGHT + Math.min(rows, VISIBLE_ROWS) * ROW_HEIGHT + BOTTOM_PADDING;
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
    <ScrollView className="max-h-72">
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
    </ScrollView>
  );
}

export function FolderTray(props: FolderTrayProps): ReactNode {
  const { folder, anchor, onClose } = props;
  const { width } = useWindowDimensions();
  return (
    <Popover
      open
      onClose={onClose}
      anchor={anchor}
      label={folder.title}
      width={width - GUTTER * 2}
      height={trayHeightOf(folder.items.length)}
      placement="above"
      scroll={false}
      className="rounded-xxl elevation-3"
    >
      <View className="px-2 pb-2">
        <View className="h-12 justify-center px-4">
          <Text variant="body-strong" numberOfLines={1}>
            {folder.title}
          </Text>
        </View>
        <TrayRows {...props} />
      </View>
    </Popover>
  );
}
