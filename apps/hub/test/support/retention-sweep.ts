import {
  AGED_ROWS,
  RETENTION_BATCH_ROWS,
  sweepAgedBatch,
  type AgedRows,
} from '../../src/store/retention';
import {
  automationRetentionPlan,
  dropRunNodes,
  forgetPlans,
  forgetRuns,
} from '../../src/store/retention-automations';
import type { Sql } from '../../src/store/sql';

function sweptAll(sql: Sql, aged: AgedRows, now: Date): number {
  let total = 0;
  for (;;) {
    const rows = sweepAgedBatch(sql, aged, now);
    total += rows;
    if (rows < RETENTION_BATCH_ROWS) return total;
  }
}

export function sweepAged(sql: Sql, now: Date, tables?: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    AGED_ROWS.filter((aged) => tables === undefined || tables.includes(aged.table)).map((aged) => [
      aged.table,
      sweptAll(sql, aged, now),
    ]),
  );
}

export function sweepAutomations(sql: Sql, now: Date): Record<string, number> {
  const plan = automationRetentionPlan(sql, now);
  const forgotten = forgetRuns(sql, plan.forgetRuns);
  return {
    automation_runs: forgotten.runs,
    automation_run_commands: forgotten.commands,
    automation_run_nodes: dropRunNodes(sql, plan.dropNodes),
    automation_plans: forgetPlans(sql, plan.orphanPlans),
    ...sweepAged(sql, now, ['automation_decisions', 'automation_questions']),
  };
}

export function sweepRetention(sql: Sql, now: Date): Record<string, number> {
  return { ...sweepAged(sql, now), ...sweepAutomations(sql, now) };
}
