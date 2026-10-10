import {
  AUTOMATION_DEFINITION,
  type Action,
  type AutomationDefinition,
  type Condition,
  type Conditions,
  type Trigger,
} from '@smarteverything/domain';

export interface Draft {
  readonly name: string;
  readonly enabled: boolean;
  readonly triggers: readonly Trigger[];
  readonly mode: Conditions['mode'];
  readonly conditions: readonly Condition[];
  readonly actions: readonly Action[];
}

export type ListChange<T> =
  | { readonly kind: 'add'; readonly item: T }
  | { readonly kind: 'set'; readonly index: number; readonly item: T }
  | { readonly kind: 'remove'; readonly index: number }
  | { readonly kind: 'move'; readonly index: number; readonly by: -1 | 1 };

export type DraftChange =
  | { readonly type: 'rename'; readonly name: string }
  | { readonly type: 'enable'; readonly enabled: boolean }
  | { readonly type: 'mode'; readonly mode: Conditions['mode'] }
  | { readonly type: 'triggers'; readonly change: ListChange<Trigger> }
  | { readonly type: 'conditions'; readonly change: ListChange<Condition> }
  | { readonly type: 'actions'; readonly change: ListChange<Action> };

export const EMPTY_DRAFT: Draft = {
  name: '',
  enabled: true,
  triggers: [],
  mode: 'all',
  conditions: [],
  actions: [],
};

export function replaced<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, position) => (position === index ? item : existing));
}

export function removed<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, position) => position !== index);
}

export function moved<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  const item = items[index];
  const other = items[target];
  if (item === undefined || other === undefined) {
    return [...items];
  }
  return replaced(replaced(items, index, other), target, item);
}

export function changeList<T>(items: readonly T[], change: ListChange<T>): readonly T[] {
  switch (change.kind) {
    case 'add':
      return [...items, change.item];
    case 'set':
      return replaced(items, change.index, change.item);
    case 'remove':
      return removed(items, change.index);
    case 'move':
      return moved(items, change.index, change.by);
  }
}

export function changeDraft(draft: Draft, change: DraftChange): Draft {
  switch (change.type) {
    case 'rename':
      return { ...draft, name: change.name };
    case 'enable':
      return { ...draft, enabled: change.enabled };
    case 'mode':
      return { ...draft, mode: change.mode };
    case 'triggers':
      return { ...draft, triggers: changeList(draft.triggers, change.change) };
    case 'conditions':
      return { ...draft, conditions: changeList(draft.conditions, change.change) };
    case 'actions':
      return { ...draft, actions: changeList(draft.actions, change.change) };
  }
}

function draftOf(name: string, enabled: boolean, definition: AutomationDefinition): Draft {
  return {
    name,
    enabled,
    triggers: definition.triggers,
    mode: definition.conditions.mode,
    conditions: definition.conditions.items,
    actions: definition.actions,
  };
}

export type ReadDraft =
  | { readonly readable: true; readonly draft: Draft }
  | { readonly readable: false; readonly problem: string };

export function readDraft(row: {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: unknown;
}): ReadDraft {
  const parsed = AUTOMATION_DEFINITION.safeParse(row.definition);
  if (!parsed.success) {
    return {
      readable: false,
      problem: `The saved definition of ${row.name} cannot be read: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    };
  }
  return { readable: true, draft: draftOf(row.name, row.enabled, parsed.data) };
}

export function definitionOf(draft: Draft): unknown {
  return {
    triggers: draft.triggers,
    conditions: { mode: draft.mode, items: draft.conditions },
    actions: draft.actions,
  };
}

export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const first = `${base.slice(0, 66)} copy`;
  if (!used.has(first.toLowerCase())) {
    return first;
  }
  let number = 2;
  while (used.has(`${first} ${String(number)}`.toLowerCase())) {
    number += 1;
  }
  return `${first} ${String(number)}`;
}
