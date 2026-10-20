import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { Point } from '../components/interactive';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import type { NavEdits } from './nav-edit-actions';
import type { NavEditor } from './nav-edit-state';
import { NavFolderRow } from './nav-folder-row';
import { navMenuItems, type FolderChoice } from './nav-item-menu';
import { NavItem } from './nav-item';
import type { NavEntry } from './nav-model';
import { toggleNavFolder } from './nav-edit-actions';
import { NavRowMenuButton } from './nav-row-button';
import type { NavRow } from './nav-rows';
import { DraggableRow } from './nav-draggable-row';
import type { NavDrag } from './use-nav-drag';

interface SidebarRowProps {
  readonly row: NavRow;
  readonly rows: readonly NavRow[];
  readonly drag: NavDrag;
  readonly edits: NavEdits;
  readonly folders: readonly FolderChoice[];
  readonly go: (entry: NavEntry) => void;
  readonly intent: (entry: NavEntry) => void;
  readonly openEditor: (editor: NavEditor) => void;
}

function ViewRow({
  row,
  hover,
  swallowed,
  items,
  onContextMenu,
  go,
  intent,
}: {
  readonly row: NavRow;
  readonly hover: boolean;
  readonly swallowed: SharedValue<boolean>;
  readonly items: ReturnType<typeof navMenuItems>;
  readonly onContextMenu: ((point: Point) => void) | undefined;
  readonly go: SidebarRowProps['go'];
  readonly intent: SidebarRowProps['intent'];
}): ReactNode {
  const title = row.kind === 'folder' ? row.folder.title : row.entry.title;
  const touch = useIdiom() === 'touch';
  return (
    <View className="flex-1 justify-center">
      {row.kind === 'folder' ? (
        <NavFolderRow
          folder={row.folder}
          onContextMenu={onContextMenu}
          onToggle={() => {
            if (!swallowed.get()) toggleNavFolder(row.key);
          }}
        />
      ) : (
        <NavItem
          entry={row.entry}
          look="sidebar"
          onContextMenu={onContextMenu}
          onPress={() => {
            if (!swallowed.get()) go(row.entry);
          }}
          onIntent={() => {
            intent(row.entry);
          }}
        />
      )}
      {touch ? null : (
        <View className="absolute inset-y-0 right-1 justify-center">
          <NavRowMenuButton items={items} label={`${title} options`} hidden={!hover} />
        </View>
      )}
    </View>
  );
}

function rowClass({ row, drag }: Pick<SidebarRowProps, 'row' | 'drag'>): string {
  return cn(
    'flex-row items-center rounded-full py-0.5',
    row.parent !== null && 'pl-5',
    drag.drop?.into === row.key && 'bg-primary-container/40',
    drag.dragKey === row.key && 'opacity-80',
  );
}

export function SidebarRow(props: SidebarRowProps): ReactNode {
  const { row, rows, drag, edits, folders, openEditor } = props;
  const [hover, setHover] = useState(false);
  const items = navMenuItems({ row, rows, folders, edits, openEditor });
  return (
    <DraggableRow
      rowKey={row.key}
      label="Navigation item"
      drag={drag}
      items={items}
      className={rowClass(props)}
      onPointerEnter={() => {
        setHover(true);
      }}
      onPointerLeave={() => {
        setHover(false);
      }}
    >
      {({ menu, swallowed }) => (
        <ViewRow
          row={row}
          hover={hover}
          swallowed={swallowed}
          items={items}
          onContextMenu={menu.onContextMenu}
          go={props.go}
          intent={props.intent}
        />
      )}
    </DraggableRow>
  );
}
