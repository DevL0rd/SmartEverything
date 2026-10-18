import {
  AUTOMATION_V2,
  type AutomationV2,
  type ConditionV2,
  type InputDeclarationV2,
  type StepV2,
  type TriggerV2,
} from '@smarteverything/domain';

export interface Draft {
  readonly name: string;
  readonly enabled: boolean;
  readonly automation: AutomationV2;
}

export type ListChange<T> =
  | { readonly kind: 'add'; readonly item: T }
  | { readonly kind: 'set'; readonly index: number; readonly item: T }
  | { readonly kind: 'remove'; readonly index: number }
  | { readonly kind: 'move'; readonly index: number; readonly by: -1 | 1 };

export interface RunBehaviour {
  readonly mode: AutomationV2['mode'];
  readonly max: AutomationV2['max'];
  readonly key: AutomationV2['key'];
}

export type DraftChange =
  | { readonly type: 'rename'; readonly name: string }
  | { readonly type: 'enable'; readonly enabled: boolean }
  | { readonly type: 'when'; readonly change: ListChange<TriggerV2> }
  | { readonly type: 'only-if'; readonly condition: ConditionV2 | undefined }
  | { readonly type: 'steps'; readonly steps: readonly StepV2[] }
  | { readonly type: 'inputs'; readonly inputs: readonly InputDeclarationV2[] }
  | { readonly type: 'run'; readonly run: RunBehaviour };

export const EMPTY_DRAFT: Draft = {
  name: '',
  enabled: true,
  automation: { when: [], steps: [] },
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

function withoutRun(automation: AutomationV2): AutomationV2 {
  const { mode: _mode, max: _max, key: _key, ...rest } = automation;
  return rest;
}

function withRun(automation: AutomationV2, run: RunBehaviour): AutomationV2 {
  return {
    ...withoutRun(automation),
    ...(run.mode === undefined ? {} : { mode: run.mode }),
    ...(run.max === undefined ? {} : { max: run.max }),
    ...(run.key === undefined ? {} : { key: run.key }),
  };
}

function withOnlyIf(automation: AutomationV2, condition: ConditionV2 | undefined): AutomationV2 {
  const { onlyIf: _onlyIf, ...rest } = automation;
  return condition === undefined ? rest : { ...rest, onlyIf: condition };
}

function withInputs(automation: AutomationV2, inputs: readonly InputDeclarationV2[]): AutomationV2 {
  const { inputs: _inputs, ...rest } = automation;
  return { ...rest, inputs: [...inputs] };
}

function changeAutomation(
  automation: AutomationV2,
  change: Exclude<DraftChange, { type: 'rename' | 'enable' }>,
): AutomationV2 {
  switch (change.type) {
    case 'when':
      return { ...automation, when: [...changeList(automation.when, change.change)] };
    case 'only-if':
      return withOnlyIf(automation, change.condition);
    case 'steps':
      return { ...automation, steps: [...change.steps] };
    case 'inputs':
      return withInputs(automation, change.inputs);
    case 'run':
      return withRun(automation, change.run);
  }
}

export function changeDraft(draft: Draft, change: DraftChange): Draft {
  if (change.type === 'rename') return { ...draft, name: change.name };
  if (change.type === 'enable') return { ...draft, enabled: change.enabled };
  return { ...draft, automation: changeAutomation(draft.automation, change) };
}

export type ReadDraft =
  | { readonly readable: true; readonly draft: Draft }
  | { readonly readable: false; readonly problem: string };

interface StoredRow {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: unknown;
}

export function readDraft(row: StoredRow): ReadDraft {
  const parsed = AUTOMATION_V2.safeParse(row.definition);
  if (parsed.success)
    return {
      readable: true,
      draft: { name: row.name, enabled: row.enabled, automation: parsed.data },
    };
  const problem = parsed.error.issues
    .map((issue) => `${issue.path.join('.')} ${issue.message}`)
    .join('; ');
  return {
    readable: false,
    problem: `The saved definition of ${row.name} cannot be read: ${problem}`,
  };
}

export function sameDraft(left: Draft, right: Draft): boolean {
  return (
    left.name === right.name &&
    left.enabled === right.enabled &&
    JSON.stringify(left.automation) === JSON.stringify(right.automation)
  );
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
