import { AUTOMATION_ROW_V3, type AutomationRowV3 } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { compareText } from '../../../format/text';

const log = new Logger('app.automations');

export interface AutomationRows {
  readonly rows: readonly AutomationRowV3[];
  readonly rejected: number;
}

export interface AutomationRowsSource {
  readonly snapshot: () => AutomationRows;
  readonly subscribe: (listener: () => void) => () => void;
}

export function parseAutomationRows(rows: readonly unknown[]): AutomationRows {
  const parsed: AutomationRowV3[] = [];
  let rejected = 0;
  for (const row of rows) {
    const result = AUTOMATION_ROW_V3.safeParse(row);
    if (result.success) parsed.push(result.data);
    else {
      rejected += 1;
      log.error('automations.row_rejected', result.error);
    }
  }
  return { rows: parsed, rejected };
}

const PARSED = new WeakMap<readonly unknown[], AutomationRows>();

export function automationRowsOf(rows: readonly unknown[]): AutomationRows {
  const known = PARSED.get(rows);
  if (known !== undefined) return known;
  const parsed = parseAutomationRows(rows);
  PARSED.set(rows, parsed);
  return parsed;
}

export function fixedAutomationRows(rows: readonly AutomationRowV3[]): AutomationRowsSource {
  const snapshot: AutomationRows = { rows, rejected: 0 };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => undefined,
  };
}

export interface AutomationList {
  readonly rows: readonly AutomationRowV3[];
  readonly byId: ReadonlyMap<string, AutomationRowV3>;
  readonly rejected: number;
}

export function listOf(snapshot: AutomationRows): AutomationList {
  const rows = [...snapshot.rows].sort(
    (left, right) => compareText(left.name, right.name) || compareText(left.id, right.id),
  );
  return {
    rows,
    byId: new Map(rows.map((row) => [row.id, row])),
    rejected: snapshot.rejected,
  };
}

export function hasUnpublishedDraft(row: AutomationRowV3): boolean {
  return row.draft !== null;
}
