import { PLANNER_OCCURRENCE_SINGLE, type PlannerItemRow } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { deleteChoicesOf, type DeleteChoice } from './item-delete';

export type ItemMenuAction =
  | { readonly kind: 'done'; readonly key: string }
  | { readonly kind: 'skip'; readonly key: string }
  | { readonly kind: 'ask' }
  | { readonly kind: 'open'; readonly intent: 'edit' | 'attach' }
  | { readonly kind: 'google'; readonly url: string }
  | { readonly kind: 'delete'; readonly choice: DeleteChoice };

export interface ItemMenuEntry {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly action: ItemMenuAction;
  readonly disabled: boolean;
  readonly shortcut?: string;
  readonly destructive?: boolean;
}

export interface ItemMenuModel {
  readonly quick: readonly ItemMenuEntry[];
  readonly items: readonly ItemMenuEntry[];
}

export interface ItemMenuInput {
  readonly item: PlannerItemRow;
  readonly occurrenceKey: string | null;
  readonly offline: boolean;
}

export type ItemShortcut = 'reschedule' | 'attach' | 'delete';

const CALENDAR_EVENT_URL = 'https://calendar.google.com/calendar/event?eid=';

const TASK_URL = 'https://tasks.google.com/task/';

export function occurrenceKeyFor(
  item: PlannerItemRow,
  occurrenceKey: string | null,
): string | null {
  return item.rrule === null ? PLANNER_OCCURRENCE_SINGLE : occurrenceKey;
}

function eventIdOf(eventId: string, calendarId: string): string {
  return btoa(`${eventId} ${calendarId}`).replace(/=+$/u, '');
}

export function googleUrlOf(item: PlannerItemRow): string | null {
  const google = item.google;
  if (google?.id === null || google?.id === undefined) return null;
  if (item.kind === 'event')
    return `${CALENDAR_EVENT_URL}${eventIdOf(google.id, google.calendarOrListId)}`;
  return `${TASK_URL}${encodeURIComponent(google.id)}`;
}

function quickOf({ item, occurrenceKey, offline }: ItemMenuInput): readonly ItemMenuEntry[] {
  const key = occurrenceKeyFor(item, occurrenceKey);
  const blocked = offline || key === null || item.status !== 'open';
  const at = key ?? PLANNER_OCCURRENCE_SINGLE;
  return [
    {
      id: 'done',
      label: 'Done',
      icon: 'check',
      action: { kind: 'done', key: at },
      disabled: blocked,
    },
    {
      id: 'skip',
      label: 'Skip',
      icon: 'skipForward',
      action: { kind: 'skip', key: at },
      disabled: blocked,
    },
    { id: 'ask', label: 'Ask AI', icon: 'sparkles', action: { kind: 'ask' }, disabled: false },
  ];
}

function googleEntry(item: PlannerItemRow): readonly ItemMenuEntry[] {
  const url = googleUrlOf(item);
  if (url === null) return [];
  return [
    {
      id: 'google',
      label: 'Open in Google',
      icon: 'externalLink',
      action: { kind: 'google', url },
      disabled: false,
    },
  ];
}

function deleteEntries({ item, occurrenceKey, offline }: ItemMenuInput): readonly ItemMenuEntry[] {
  return deleteChoicesOf(item, occurrenceKey).map((choice, index) => ({
    id: choice.id,
    label: choice.label,
    icon: 'trash',
    action: { kind: 'delete', choice },
    disabled: offline,
    destructive: true,
    ...(index === 0 ? { shortcut: 'Del' } : {}),
  }));
}

export function itemMenuOf(input: ItemMenuInput): ItemMenuModel {
  const { offline } = input;
  return {
    quick: quickOf(input),
    items: [
      {
        id: 'reschedule',
        label: 'Reschedule',
        icon: 'calendar',
        action: { kind: 'open', intent: 'edit' },
        disabled: offline,
        shortcut: 'R',
      },
      {
        id: 'attach',
        label: 'Attach a device',
        icon: 'zap',
        action: { kind: 'open', intent: 'attach' },
        disabled: offline,
        shortcut: 'A',
      },
      {
        id: 'repeat',
        label: 'Repeat',
        icon: 'repeat',
        action: { kind: 'open', intent: 'edit' },
        disabled: offline,
      },
      ...googleEntry(input.item),
      ...deleteEntries(input),
    ],
  };
}

export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const SHORTCUTS: Readonly<Record<string, ItemShortcut>> = {
  r: 'reschedule',
  a: 'attach',
  Delete: 'delete',
};

export function itemShortcutOf(press: KeyPress, editing: boolean): ItemShortcut | null {
  if (editing || press.ctrlKey || press.metaKey || press.altKey) return null;
  return SHORTCUTS[press.key.length === 1 ? press.key.toLowerCase() : press.key] ?? null;
}

export function shortcutEntryOf(
  model: ItemMenuModel,
  shortcut: ItemShortcut,
): ItemMenuEntry | null {
  const id =
    shortcut === 'delete' ? model.items.find((entry) => entry.destructive === true)?.id : shortcut;
  return model.items.find((entry) => entry.id === id && !entry.disabled) ?? null;
}
