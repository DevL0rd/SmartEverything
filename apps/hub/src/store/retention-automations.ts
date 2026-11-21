import { z } from 'zod';
import {
  ACTIVE_RUN_RECORD_STATUSES,
  appendTo,
  RUN_RECORD_MODE,
  RUN_RECORD_STATUS,
  type RunRecordMode,
  type RunRecordStatus,
} from '@smarteverything/domain';
import { DAY_MS } from '../metrics/minute';
import type { Sql } from './sql';

const SUMMARY_DAYS = 30;
const TROUBLED_RUN_DAYS = 90;
const DRY_RUN_DAYS = 7;
export const AUTOMATION_DECISION_DAYS = 30;
const PLAN_GRACE_DAYS = 1;
export const NODE_BYTES_PER_AUTOMATION = 20 * 1024 * 1024;

const TROUBLED_STATUSES: ReadonlySet<string> = new Set(['failed', 'cancelled', 'interrupted']);

export interface RunRetentionFact {
  readonly id: string;
  readonly automationId: string;
  readonly status: RunRecordStatus;
  readonly mode: RunRecordMode;
  readonly endedAt: string;
  readonly nodeBytes: number;
}

export interface RunRetentionPlan {
  readonly forgetRuns: readonly string[];
  readonly dropNodes: readonly string[];
}

function keptDays(fact: RunRetentionFact): number {
  if (fact.mode !== 'live') return DRY_RUN_DAYS;
  return TROUBLED_STATUSES.has(fact.status) ? TROUBLED_RUN_DAYS : SUMMARY_DAYS;
}

function isOld(fact: RunRetentionFact, now: Date): boolean {
  return new Date(fact.endedAt).getTime() < now.getTime() - keptDays(fact) * DAY_MS;
}

function oldestFirst(a: RunRetentionFact, b: RunRetentionFact): number {
  return a.endedAt < b.endedAt ? -1 : a.endedAt > b.endedAt ? 1 : a.id < b.id ? -1 : 1;
}

function overBudget(facts: readonly RunRetentionFact[]): readonly string[] {
  let bytes = facts.reduce((sum, fact) => sum + fact.nodeBytes, 0);
  const dropped: string[] = [];
  const succeededFirst = [
    ...facts.filter((fact) => fact.status === 'succeeded').sort(oldestFirst),
    ...facts.filter((fact) => fact.status !== 'succeeded').sort(oldestFirst),
  ];
  for (const fact of succeededFirst) {
    if (bytes <= NODE_BYTES_PER_AUTOMATION) break;
    if (fact.nodeBytes === 0) continue;
    dropped.push(fact.id);
    bytes -= fact.nodeBytes;
  }
  return dropped;
}

export function planRunRetention(facts: readonly RunRetentionFact[], now: Date): RunRetentionPlan {
  const finished = facts.filter((fact) => !ACTIVE_RUN_RECORD_STATUSES.has(fact.status));
  const forgetRuns = finished.filter((fact) => isOld(fact, now)).map((fact) => fact.id);
  const forgotten = new Set(forgetRuns);
  const kept = finished.filter((fact) => !forgotten.has(fact.id));
  const automations = new Map<string, RunRetentionFact[]>();
  for (const fact of kept) appendTo(automations, fact.automationId, fact);
  const dropNodes = [...automations.values()].flatMap((runs) => overBudget(runs));
  return { forgetRuns, dropNodes };
}

export function orphanPlans(
  planHashes: readonly string[],
  referenced: ReadonlySet<string>,
): readonly string[] {
  return planHashes.filter((hash) => !referenced.has(hash));
}

const FACT_ROW = z.strictObject({
  id: z.string(),
  automation_id: z.string(),
  status: RUN_RECORD_STATUS,
  mode: RUN_RECORD_MODE,
  ended_at: z.string(),
  node_bytes: z.int(),
});
const HASH_ROW = z.strictObject({ hash: z.string() });

function runRetentionFacts(sql: Sql): RunRetentionFact[] {
  return sql
    .all(
      FACT_ROW,
      `select r.id, r.automation_id, r.status, r.mode, coalesce(r.finished_at, r.created_at) as ended_at,
         coalesce((select sum(length(cast(n.path as blob)) + length(cast(n.node_id as blob))
           + coalesce(length(cast(n.input_preview as blob)),0) + coalesce(length(cast(n.output_preview as blob)),0)
           + coalesce(length(cast(n.error as blob)),0) + length(cast(n.command_ids as blob)))
           from automation_run_nodes n where n.run_id = r.id), 0) as node_bytes
       from automation_runs r`,
    )
    .map((row) => ({
      id: row.id,
      automationId: row.automation_id,
      status: row.status,
      mode: row.mode,
      endedAt: row.ended_at,
      nodeBytes: row.node_bytes,
    }));
}

export interface AutomationRetentionPlan extends RunRetentionPlan {
  readonly orphanPlans: readonly string[];
}

export function automationRetentionPlan(sql: Sql, now: Date): AutomationRetentionPlan {
  return {
    ...planRunRetention(runRetentionFacts(sql), now),
    orphanPlans: orphanPlanHashes(sql, now),
  };
}

const SELECTED = 'in (select value from json_each($ids))';

export function forgetRuns(sql: Sql, ids: readonly string[]): { commands: number; runs: number } {
  const selected = { ids: JSON.stringify(ids) };
  return {
    commands: sql.run(
      'forget the commands of old runs',
      `delete from automation_run_commands where run_id ${SELECTED}`,
      selected,
    ),
    runs: sql.run(
      'forget old automation runs',
      `delete from automation_runs where id ${SELECTED}`,
      selected,
    ),
  };
}

export function dropRunNodes(sql: Sql, ids: readonly string[]): number {
  return sql.run(
    'drop node records over the automation ceiling',
    `delete from automation_run_nodes where run_id ${SELECTED}`,
    { ids: JSON.stringify(ids) },
  );
}

export function forgetPlans(sql: Sql, hashes: readonly string[]): number {
  return sql.run(
    'forget orphan automation plans',
    `delete from automation_plans where hash ${SELECTED}`,
    { ids: JSON.stringify(hashes) },
  );
}

function orphanPlanHashes(sql: Sql, now: Date): readonly string[] {
  const candidates = sql
    .all(HASH_ROW, 'select hash from automation_plans where created_at < $before', {
      before: new Date(now.getTime() - PLAN_GRACE_DAYS * DAY_MS).toISOString(),
    })
    .map((row) => row.hash);
  const referenced = new Set(
    sql
      .all(
        HASH_ROW,
        `select plan_hash as hash from automation_revisions
         union select plan_hash from automation_function_revisions
         union select plan_hash from automation_runs`,
      )
      .map((row) => row.hash),
  );
  return orphanPlans(candidates, referenced);
}
