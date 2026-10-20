import type { MenuItem } from '../components/menu-rows';
import type { NavEdits } from './nav-edit-actions';
import type { NavEditor } from './nav-edit-state';
import type { NavNodeView } from './nav-model';
import { removalMenuItem, removalOf } from './nav-removal';

export interface SlotMenuContext {
  readonly overflow: readonly NavNodeView[];
  readonly edits: Pick<NavEdits, 'place' | 'remove' | 'hide' | 'ungroup'>;
  readonly openEditor: (editor: NavEditor) => void;
}

function belowTheBar(node: NavNodeView, { overflow, edits }: SlotMenuContext): MenuItem[] {
  if (overflow.length === 0) return [];
  return [
    {
      label: 'Remove from bar',
      description: 'Keeps it in the navigation sheet',
      icon: 'chevronDown',
      onPress: (): void => {
        edits.place(node.key, { parent: null, before: overflow[1]?.key ?? null });
      },
    },
  ];
}

function removal(node: NavNodeView, { edits }: SlotMenuContext): MenuItem[] {
  const found = removalOf(node);
  switch (found?.kind) {
    case 'unpin':
      return [removalMenuItem(found, node.key, edits)];
    case 'hide':
      return [
        {
          ...removalMenuItem(found, node.key, edits),
          label: 'Hide page',
          description: 'It stays under More pages in the sheet',
        },
      ];
    case 'ungroup':
    case undefined:
      return [];
  }
}

function appearance(node: NavNodeView, { openEditor }: SlotMenuContext): MenuItem[] {
  if (node.kind === 'section') return [];
  return [
    {
      label: 'Rename',
      icon: 'pencil',
      onPress: (): void => {
        openEditor({ kind: 'rename', key: node.key });
      },
    },
    {
      label: 'Change icon',
      icon: 'palette',
      onPress: (): void => {
        openEditor({ kind: 'icon', key: node.key });
      },
    },
  ];
}

export function slotMenuItems(node: NavNodeView, context: SlotMenuContext): readonly MenuItem[] {
  return [...appearance(node, context), ...belowTheBar(node, context), ...removal(node, context)];
}
