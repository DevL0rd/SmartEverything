import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  useContextMenu,
  type ContextMenu,
  type MenuItem,
  type MenuOptions,
} from '../../../components/menu';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import type { FileNode } from '../source/types';
import type { FileBrowserHandle } from './browser-types';
import { menuOf, type MenuSpec } from './menu-specs';
import { NodeGlyph } from './node-glyph';
import { selectionLabelOf } from './selection-model';

export function menuItemsOf(
  specs: readonly MenuSpec[],
  run: (id: string) => void,
): readonly MenuItem[] {
  return specs.map((spec) => ({
    id: spec.id,
    label: spec.label,
    icon: spec.icon,
    ...(spec.shortcut === null ? {} : { shortcut: spec.shortcut }),
    ...(spec.destructive ? { destructive: true } : {}),
    section: spec.group,
    onPress: (): void => {
      run(spec.id);
    },
  }));
}

function MenuTitle<O>({
  browser,
  node,
  count,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly node: FileNode<O>;
  readonly count: number;
}): ReactNode {
  const { idiom, split } = useSizeClass();
  if (idiom !== 'touch' || split) return null;
  return (
    <View className="flex-row items-center gap-3 rounded-lg bg-surface-1 px-4 py-3 elevation-2">
      <View className="w-8 items-center">
        <NodeGlyph node={node} source={browser.source} well={null} />
      </View>
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {count > 1 ? selectionLabelOf(count) : node.name}
      </Text>
    </View>
  );
}

export interface RowMenu {
  readonly items: readonly MenuItem[];
  readonly options: MenuOptions;
  readonly context: ContextMenu;
  readonly host: ReactNode;
}

export function useRowMenu<O>(browser: FileBrowserHandle<O>, node: FileNode<O>): RowMenu {
  const nodes = browser.drag.payloadOf(node).nodes;
  const actions =
    nodes.length > 1
      ? {
          menu: menuOf(nodes, browser.menuContext, browser.source.actions(nodes)),
          quick: [],
        }
      : browser.rowActions(node);
  const run = (id: string): void => {
    browser.commands.menu(id, id === 'rename' || id === 'open' ? [node] : nodes);
  };
  const items = menuItemsOf(actions.menu, run);
  const quick = new Set(actions.quick.map((spec) => spec.id));
  const context = useContextMenu(
    menuItemsOf(
      actions.menu.filter((spec) => !quick.has(spec.id)),
      run,
    ),
    `${node.name} actions`,
    { quick: menuItemsOf(actions.quick, run) },
  );
  const options: MenuOptions = {
    header: () => <MenuTitle browser={browser} node={node} count={nodes.length} />,
  };
  return { items, options, context, host: context.host };
}
