import {
  AUTOMATION_V2,
  type AutomationRow,
  type AutomationV2,
  type InputDeclarationV2,
} from '@smarteverything/domain';

export interface Callable {
  readonly id: string;
  readonly name: string;
  readonly reusable: boolean;
  readonly inputs: readonly InputDeclarationV2[];
}

const PARSED = new WeakMap<object, AutomationV2 | null>();

function parseStored(definition: unknown): AutomationV2 | null {
  const parsed = AUTOMATION_V2.safeParse(definition);
  return parsed.success ? parsed.data : null;
}

export function storedAutomationOf(row: Pick<AutomationRow, 'definition'>): AutomationV2 | null {
  const { definition } = row;
  if (!PARSED.has(definition)) PARSED.set(definition, parseStored(definition));
  return PARSED.get(definition) ?? null;
}

export function isReusable(automation: AutomationV2): boolean {
  return automation.when.length === 0;
}

export function calleeOf(row: AutomationRow): Callable | null {
  const automation = storedAutomationOf(row);
  return automation === null
    ? null
    : {
        id: row.id,
        name: row.name,
        reusable: isReusable(automation),
        inputs: automation.inputs ?? [],
      };
}

export function callablesIn(rows: readonly AutomationRow[]): readonly Callable[] {
  return rows.flatMap((row) => {
    const callee = calleeOf(row);
    return callee === null ? [] : [callee];
  });
}
