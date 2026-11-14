import type { PlannerItemRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { Linking, type GestureResponderEvent } from 'react-native';
import type { Rect } from '../../../components/anchor';
import { confirm } from '../../../components/confirm-store';
import type { Point } from '../../../components/interactive';
import { Menu, useMenuTrigger, type MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { usePlannerItems, usePlannerWrites, type PlannerWrites } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { askAboutItem } from './item-ask';
import type { DeleteChoice } from './item-delete';
import { itemMenuOf, type ItemMenuAction, type ItemMenuEntry } from './item-menu';
import { itemIn } from './item-sheet';
import {
  clearPlannerSelection,
  openPlannerItem,
  readPlannerSelection,
  useItemOpen,
  usePanelHosted,
  type ItemOpen,
} from './selection';

export interface ItemTargetKey {
  readonly itemId: string;
  readonly occurrenceKey: string | null;
}

function reported(work: Promise<unknown>, message: string): void {
  background(
    work.catch((error: unknown) => {
      notify({ message, error, tone: 'critical' });
    }),
    'planner.item_menu_failed',
  );
}

async function deleteConfirmed(
  writes: PlannerWrites,
  item: PlannerItemRow,
  choice: DeleteChoice,
): Promise<void> {
  const accepted = await confirm({
    title: `Delete “${item.title}”?`,
    body: choice.question,
    confirmLabel: choice.label,
    tone: 'destructive',
  });
  if (!accepted) return;
  if (readPlannerSelection()?.itemId === item.id) clearPlannerSelection();
  await writes.deleteItem(item, choice.scope);
}

export type ItemActionRunner = (action: ItemMenuAction) => void;

export function useItemActionRunner(item: PlannerItemRow, target: ItemTargetKey): ItemActionRunner {
  const { person } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  const hosted = usePanelHosted();
  return (action): void => {
    switch (action.kind) {
      case 'done':
        reported(
          writes.completeItem(item.id, { occurrence_key: action.key }),
          'Couldn’t mark that done',
        );
        return;
      case 'skip':
        reported(writes.skipItem(item.id, action.key), 'Couldn’t skip that');
        return;
      case 'ask':
        askAboutItem(item, target.occurrenceKey);
        return;
      case 'open':
        openPlannerItem(target, action.intent, hosted);
        return;
      case 'google':
        reported(Linking.openURL(action.url), 'Couldn’t open Google');
        return;
      case 'delete':
        reported(deleteConfirmed(writes, item, action.choice), 'Couldn’t delete that');
    }
  };
}

export function menuItemOf(entry: ItemMenuEntry, run: ItemActionRunner): MenuItem {
  return {
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    disabled: entry.disabled,
    ...(entry.shortcut === undefined ? {} : { shortcut: entry.shortcut }),
    ...(entry.destructive === true ? { destructive: true } : {}),
    onPress: (): void => {
      run(entry.action);
    },
  };
}

export interface ItemMenuItems {
  readonly quick: readonly MenuItem[];
  readonly items: readonly MenuItem[];
}

export function useItemMenuItems(item: PlannerItemRow, target: ItemTargetKey): ItemMenuItems {
  const { offline } = usePlannerFrame();
  const run = useItemActionRunner(item, target);
  const model = itemMenuOf({ item, occurrenceKey: target.occurrenceKey, offline });
  return {
    quick: model.quick.map((entry) => menuItemOf(entry, run)),
    items: model.items.map((entry) => menuItemOf(entry, run)),
  };
}

function OpenItemMenu({
  item,
  target,
  anchor,
  onClose,
}: {
  readonly item: PlannerItemRow;
  readonly target: ItemTargetKey;
  readonly anchor: Rect;
  readonly onClose: () => void;
}): ReactNode {
  const { quick, items } = useItemMenuItems(item, target);
  return (
    <Menu items={items} options={{ quick }} anchor={anchor} label={item.title} onClose={onClose} />
  );
}

function ItemMenu({
  target,
  anchor,
  onClose,
}: {
  readonly target: ItemTargetKey;
  readonly anchor: Rect;
  readonly onClose: () => void;
}): ReactNode {
  const { person } = usePlannerFrame();
  const item = itemIn(usePlannerItems(person), target.itemId);
  if (item === null) return null;
  return <OpenItemMenu item={item} target={target} anchor={anchor} onClose={onClose} />;
}

export interface ItemPress {
  readonly open: ItemOpen;
  readonly onLongPress: (event?: GestureResponderEvent) => void;
  readonly onContextMenu: (point: Point) => void;
  readonly menu: ReactNode;
}

export function useItemPress(itemId: string, occurrenceKey: string | null): ItemPress {
  const open = useItemOpen(itemId, occurrenceKey);
  const trigger = useMenuTrigger();
  return {
    open,
    onLongPress: trigger.onLongPress,
    onContextMenu: trigger.onContextMenu,
    menu:
      trigger.anchor === null ? null : (
        <ItemMenu
          target={{ itemId, occurrenceKey }}
          anchor={trigger.anchor}
          onClose={trigger.close}
        />
      ),
  };
}
