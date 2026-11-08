import type { NodeKindLookup } from '@smarteverything/domain';
import { AUTOMATION_ROW } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import { compareText } from '../../../format/text';
import { adaptAutomationRow, type AutomationRow } from './graph-adapter';

const log = new Logger('app.automations');

export interface UnstructuredAutomation {
  readonly id: string;
  readonly name: string;
  readonly problems: readonly GraphProblem[];
}

export interface AutomationRows {
  readonly rows: readonly AutomationRow[];
  readonly rejected: number;
  readonly unstructured: readonly UnstructuredAutomation[];
}

export interface AutomationRowsSource {
  readonly snapshot: () => AutomationRows;
  readonly subscribe: (listener: () => void) => () => void;
}

type RowOutcome =
  | { readonly kind: 'ready'; readonly row: AutomationRow }
  | { readonly kind: 'unstructured'; readonly entry: UnstructuredAutomation }
  | { readonly kind: 'rejected' };

const OUTCOMES = new WeakMap<object, RowOutcome>();

function outcomeOf(raw: unknown, kinds: NodeKindLookup): RowOutcome {
  const result = AUTOMATION_ROW.safeParse(raw);
  if (!result.success) {
    log.error('automations.row_rejected', result.error);
    return { kind: 'rejected' };
  }
  const adapted = adaptAutomationRow(result.data, kinds);
  if (adapted.kind === 'ready') return { kind: 'ready', row: adapted.value };
  const entry = { id: result.data.id, name: result.data.name, problems: adapted.problems };
  log.error('automations.row_unstructured', undefined, {
    id: entry.id,
    problems: entry.problems.map((problem) => problem.code),
  });
  return { kind: 'unstructured', entry };
}

function memoisedOutcome(raw: unknown, kinds: NodeKindLookup): RowOutcome {
  if (typeof raw !== 'object' || raw === null) return outcomeOf(raw, kinds);
  const known = OUTCOMES.get(raw);
  if (known !== undefined) return known;
  const outcome = outcomeOf(raw, kinds);
  OUTCOMES.set(raw, outcome);
  return outcome;
}

export function parseAutomationRows(
  rows: readonly unknown[],
  kinds: NodeKindLookup,
): AutomationRows {
  const parsed: AutomationRow[] = [];
  const unstructured: UnstructuredAutomation[] = [];
  let rejected = 0;
  for (const raw of rows) {
    const outcome = memoisedOutcome(raw, kinds);
    if (outcome.kind === 'ready') parsed.push(outcome.row);
    else if (outcome.kind === 'unstructured') unstructured.push(outcome.entry);
    else rejected += 1;
  }
  return { rows: parsed, rejected: rejected + unstructured.length, unstructured };
}

const PARSED = new WeakMap<readonly unknown[], AutomationRows>();

export function automationRowsOf(rows: readonly unknown[], kinds: NodeKindLookup): AutomationRows {
  const known = PARSED.get(rows);
  if (known !== undefined) return known;
  const parsed = parseAutomationRows(rows, kinds);
  PARSED.set(rows, parsed);
  return parsed;
}

export function fixedAutomationRows(rows: readonly AutomationRow[]): AutomationRowsSource {
  const snapshot: AutomationRows = { rows, rejected: 0, unstructured: [] };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => undefined,
  };
}

export interface AutomationList {
  readonly rows: readonly AutomationRow[];
  readonly byId: ReadonlyMap<string, AutomationRow>;
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

export function hasUnpublishedDraft(row: AutomationRow): boolean {
  return row.draft !== null;
}
