import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { measureAnchor, type Rect } from '../components/anchor';
import { useContextMenu, type MenuItem } from '../components/menu';
import { Popover } from '../components/popover';
import { Text } from '../components/text';
import { NavItem } from './nav-item';
import type { NavEntry, NavFolderView } from './nav-model';

const POPOVER_WIDTH = 240;

type Look = 'rail' | 'rail-dense' | 'collapsed';

function beside(rect: Rect): Rect {
  return { x: rect.x + rect.width, y: rect.y, width: 0, height: 0 };
}

function FolderMember({
  entry,
  items,
  close,
  go,
  intent,
}: {
  readonly entry: NavEntry;
  readonly items: readonly MenuItem[];
  readonly close: () => void;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
}): ReactNode {
  const menu = useContextMenu(items, entry.title);
  return (
    <>
      <NavItem
        entry={entry}
        look="sidebar"
        onPress={() => {
          close();
          go(entry);
        }}
        onLongPress={menu.onLongPress}
        onIntent={() => {
          intent(entry);
        }}
      />
      {menu.host}
    </>
  );
}

function FolderMembers({
  folder,
  anchor,
  close,
  go,
  intent,
  menuOf,
}: {
  readonly folder: NavFolderView;
  readonly anchor: Rect | null;
  readonly close: () => void;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
  readonly menuOf: ((key: string) => readonly MenuItem[]) | undefined;
}): ReactNode {
  return (
    <Popover
      open={anchor !== null}
      onClose={close}
      anchor={anchor}
      label={folder.title}
      width={POPOVER_WIDTH}
    >
      <View className="gap-0.5 p-1">
        <Text variant="caption" tone="faint" className="px-3 py-1">
          {folder.title}
        </Text>
        {folder.items.map((entry) => (
          <FolderMember
            key={entry.key}
            entry={entry}
            items={menuOf === undefined ? [] : menuOf(entry.key)}
            close={close}
            go={go}
            intent={intent}
          />
        ))}
      </View>
    </Popover>
  );
}

export function RailFolder({
  folder,
  look,
  go,
  intent,
  swallowed,
  menuOf,
}: {
  readonly folder: NavFolderView;
  readonly look: Look;
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
  readonly swallowed?: SharedValue<boolean>;
  readonly menuOf?: ((key: string) => readonly MenuItem[]) | undefined;
}): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return (
    <View ref={ref} collapsable={false}>
      <NavItem
        entry={{ ...folder, shortTitle: folder.title, badge: null, count: 0, missing: false }}
        look={look}
        onPress={() => {
          if (swallowed?.get() === true) return;
          measureAnchor(ref, (rect) => {
            setAnchor(beside(rect));
          });
        }}
      />
      <FolderMembers
        folder={folder}
        anchor={anchor}
        close={() => {
          setAnchor(null);
        }}
        go={go}
        intent={intent}
        menuOf={menuOf}
      />
    </View>
  );
}
