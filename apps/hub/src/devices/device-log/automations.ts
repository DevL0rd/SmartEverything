import { AUTOMATION_V2, type AutomationRow, type AutomationV2 } from '@smarteverything/domain';

export interface ReadableAutomation {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationV2;
}

export function readableAutomation(row: AutomationRow): ReadableAutomation | undefined {
  const parsed = AUTOMATION_V2.safeParse(row.definition);
  return parsed.success
    ? { id: row.id, name: row.name, enabled: row.enabled, definition: parsed.data }
    : undefined;
}

export function readableAutomations(rows: readonly AutomationRow[]): ReadableAutomation[] {
  return rows.flatMap((row) => readableAutomation(row) ?? []);
}
