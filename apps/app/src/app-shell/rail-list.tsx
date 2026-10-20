import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useAnchoredMenu, type MenuItem } from '../components/menu';
import { cn } from '../design/cn';
import type { NavViewProps } from './bottom-bar';
import { DraggableRow } from './nav-draggable-row';
import { useNavEdits } from './nav-edit-actions';
import { navEditor } from './nav-edit-state';
import { navMenuItems } from './nav-item-menu';
import { NavItem } from './nav-item';
import { navRows, topRows, type NavRow } from './nav-rows';
import { RailFolder } from './rail-folder';
import { DropLine } from './sidebar-list';
import { useNavDrag, type NavDrag } from './use-nav-drag';

export type RailLook = 'rail' | 'rail-dense' | 'collapsed';

interface RailRowProps extends NavViewProps {
  readonly row: NavRow;
  readonly look: RailLook;
  readonly drag: NavDrag;
  readonly itemsOf: (key: string) => readonly MenuItem[];
}

function rowClass({ row, drag }: Pick<RailRowProps, 'row' | 'drag'>): string {
  return cn(
    'w-full rounded-3xl py-0.5',
    drag.drop?.into === row.key && 'bg-primary-container/40',
    drag.dragKey === row.key && 'opacity-80',
  );
}

function RailRow(props: RailRowProps): ReactNode {
  const { row, look, drag, itemsOf, go, intent } = props;
  const title = row.kind === 'folder' ? row.folder.title : row.entry.title;
  const items = itemsOf(row.key);
  const anchored = useAnchoredMenu(items, title);
  return (
    <DraggableRow
      rowKey={row.key}
      label={title}
      drag={drag}
      items={items}
      className={rowClass(props)}
    >
      {({ swallowed }) => (
        <View ref={anchored.ref} collapsable={false}>
          {row.kind === 'folder' ? (
            <RailFolder
              folder={row.folder}
              look={look}
              go={go}
              intent={intent}
              swallowed={swallowed}
              menuOf={itemsOf}
            />
          ) : (
            <NavItem
              entry={row.entry}
              look={look}
              onPress={() => {
                if (!swallowed.get()) go(row.entry);
              }}
              onIntent={() => {
                intent(row.entry);
              }}
            />
          )}
          {anchored.menu}
        </View>
      )}
    </DraggableRow>
  );
}

export function RailList({
  model,
  go,
  intent,
  look,
}: NavViewProps & { readonly look: RailLook }): ReactNode {
  const edits = useNavEdits();
  const rows = topRows(model.nodes);
  const all = navRows(model.nodes, true);
  const folders = all.flatMap((row) =>
    row.kind === 'folder' ? [{ key: row.key, title: row.folder.title }] : [],
  );
  const drag = useNavDrag(rows, edits.place, edits.foldInto);
  const itemsOf = (key: string): readonly MenuItem[] => {
    const row = all.find((candidate) => candidate.key === key);
    return row === undefined
      ? []
      : navMenuItems({ row, rows: all, folders, edits, openEditor: navEditor.set });
  };
  return (
    <ScrollView
      scrollEnabled={drag.dragKey === null}
      contentContainerClassName={look === 'rail-dense' ? '' : 'pt-2'}
    >
      <View>
        {rows.map((row) => (
          <RailRow
            key={row.key}
            row={row}
            look={look}
            drag={drag}
            itemsOf={itemsOf}
            model={model}
            go={go}
            intent={intent}
          />
        ))}
        <DropLine drop={drag.drop} />
      </View>
    </ScrollView>
  );
}
