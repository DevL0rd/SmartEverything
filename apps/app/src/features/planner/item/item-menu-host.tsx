import type { PlannerItemRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { Linking, type GestureResponderEvent } from 'react-native';
import type { Rect } from '../../../components/anchor';
import { confirm } from '../../../components/confirm-store';
import type { Point } from '../../../components/interactive';
import { Menu, useMenuTrigger, type MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { isNative } from '../../../design/platform';
import { useSettings } from '../../../store/selectors';
import { usePlannerWrites, type PlannerPerson, type PlannerWrites } from '../data';
import { useVisibleItem } from '../data/assignment';
import { usePlannerFrame } from '../frame/frame-context';
import { askAboutItem } from './item-ask';
import type { DeleteChoice } from './item-delete';
import {
  itemMenuOf,
  itemShortcutOf,
  shortcutEntryOf,
  type ItemMenuAction,
  type ItemMenuEntry,
  type ItemMenuModel,
  type ItemOpenIntent,
} from './item-menu';
import { OUTDENT_CHANGE, indentChangeOf, type NestTarget } from './steps-model';
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
  readonly nest?: NestTarget | null;
}

export interface ItemActionScope {
  readonly person: PlannerPerson;
  readonly offline: boolean;
  readonly onOpen: (intent: ItemOpenIntent) => void;
  readonly onDeleted: (item: PlannerItemRow) => void;
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
  onDeleted: (item: PlannerItemRow) => void,
): Promise<void> {
  const accepted = await confirm({
    title: `Delete “${item.title}”?`,
    body: choice.question,
    confirmLabel: choice.label,
    tone: 'destructive',
  });
  if (!accepted) return;
  onDeleted(item);
  await writes.deleteItem(item, choice.scope);
}

export function useFrameActionScope(target: ItemTargetKey): ItemActionScope {
  const { person, offline } = usePlannerFrame();
  const hosted = usePanelHosted();
  return {
    person,
    offline,
    onOpen: (intent): void => {
      openPlannerItem(target, intent, hosted);
    },
    onDeleted: (item): void => {
      if (readPlannerSelection()?.itemId === item.id) clearPlannerSelection();
    },
  };
}

export type ItemActionRunner = (action: ItemMenuAction) => void;

export function useItemActionRunner(
  item: PlannerItemRow,
  target: ItemTargetKey,
  scope: ItemActionScope,
): ItemActionRunner {
  const writes = usePlannerWrites(scope.person);
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
        scope.onOpen(action.intent);
        return;
      case 'google':
        reported(Linking.openURL(action.url), 'Couldn’t open Google');
        return;
      case 'indent':
        reported(
          writes.updateItem(item, {
            changes: indentChangeOf(action.parentId),
          }),
          'Couldn’t make that a step',
        );
        return;
      case 'outdent':
        reported(
          writes.updateItem(item, { changes: OUTDENT_CHANGE }),
          'Couldn’t make that its own task',
        );
        return;
      case 'delete':
        reported(
          deleteConfirmed(writes, item, action.choice, scope.onDeleted),
          'Couldn’t delete that',
        );
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
  readonly model: ItemMenuModel;
  readonly run: ItemActionRunner;
  readonly quick: readonly MenuItem[];
  readonly items: readonly MenuItem[];
}

export function useItemMenuItems(
  item: PlannerItemRow,
  target: ItemTargetKey,
  scope: ItemActionScope,
): ItemMenuItems {
  const timeZone = useSettings().time_zone;
  const run = useItemActionRunner(item, target, scope);
  const model = itemMenuOf({
    item,
    occurrenceKey: target.occurrenceKey,
    offline: scope.offline,
    timeZone,
    nest: target.nest ?? null,
  });
  return {
    model,
    run,
    quick: model.quick.map((entry) => menuItemOf(entry, run)),
    items: model.items.map((entry) => menuItemOf(entry, run)),
  };
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useItemKeys(menu: ItemMenuItems, active: boolean): void {
  const onKey = useEffectEvent((event: KeyboardEvent): void => {
    const shortcut = itemShortcutOf(event, isTextEntry(event.target));
    if (shortcut === null) return;
    const entry = shortcutEntryOf(menu.model, shortcut);
    if (entry === null) return;
    event.preventDefault();
    menu.run(entry.action);
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (!event.defaultPrevented) onKey(event);
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active]);
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
  const { quick, items } = useItemMenuItems(item, target, useFrameActionScope(target));
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
  const item = useVisibleItem(person, target.itemId);
  if (item === null) return null;
  return <OpenItemMenu item={item} target={target} anchor={anchor} onClose={onClose} />;
}

export interface ItemPress {
  readonly open: ItemOpen;
  readonly onLongPress: (event?: GestureResponderEvent) => void;
  readonly onContextMenu: (point: Point) => void;
  readonly menu: ReactNode;
}

export function useItemPress(
  itemId: string,
  occurrenceKey: string | null,
  nest: NestTarget | null = null,
): ItemPress {
  const open = useItemOpen(itemId, occurrenceKey);
  const trigger = useMenuTrigger();
  return {
    open,
    onLongPress: trigger.onLongPress,
    onContextMenu: trigger.onContextMenu,
    menu:
      trigger.anchor === null ? null : (
        <ItemMenu
          target={{ itemId, occurrenceKey, nest }}
          anchor={trigger.anchor}
          onClose={trigger.close}
        />
      ),
  };
}
