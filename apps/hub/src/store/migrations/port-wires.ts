import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { planHashOf } from '../repositories/automation-plans';
import { jsonText, type Sql } from '../sql';
import type { Migration } from './migration';
import { FormulaLeftError, rewriteText } from './port-wires-rewrite';
import {
  PLAN_OWNERS,
  PLAN_REFERENCES,
  PLAN_RUN_COUNT,
  PLAN_RUN_REMOVALS,
  PLAN_RUNS_REMOVAL,
  SOURCES,
  STORED,
  type Source,
  type Stored,
} from './port-wires-sources';

const PLAN_ROW = z.object({ hash: z.string(), text: z.string() });
const OWNER = z.object({ owner: z.string() });
const COUNT = z.object({ count: z.number() });

type Counts = Readonly<Record<string, number>>;

interface Change {
  readonly wires: number;
  readonly apply: () => Counts;
}

interface Pass {
  readonly changes: Change[];
  readonly problems: string[];
  readonly kept: Set<string>;
  readonly removed: Set<string>;
}

function keyOf(source: Source, row: Stored): Readonly<Record<string, string | number>> {
  return source.byRevision ? { id: row.id, revision: row.revision } : { id: row.id };
}

function removeOld(sql: Sql, label: string, remove: string, row: Stored): Change {
  const key = { id: row.id, revision: row.revision };
  return {
    wires: 0,
    apply: () => ({ [`${label}Deleted`]: sql.run(`delete ${row.owner}`, remove, key) }),
  };
}

function rewriteRow(sql: Sql, source: Source, row: Stored, pass: Pass): void {
  const rewritten = rewriteText(row.text);
  if (rewritten.formulas.length > 0) {
    if (source.remove !== undefined && row.old === 1) {
      if (row.plan !== null) pass.removed.add(row.plan);
      pass.changes.push(removeOld(sql, source.label, source.remove, row));
      return;
    }
    pass.problems.push(`${row.owner} (${rewritten.formulas.join(', ')})`);
    return;
  }
  if (row.plan !== null) pass.kept.add(row.plan);
  if (rewritten.wires === 0) return;
  const parameters = { ...keyOf(source, row), text: jsonText(rewritten.value) };
  pass.changes.push({
    wires: rewritten.wires,
    apply: () => ({
      [source.label]: sql.run(`wire the formulas of ${row.owner}`, source.update, parameters),
    }),
  });
}

function planOwners(sql: Sql, hash: string): string {
  const owners = sql.all(OWNER, PLAN_OWNERS, { hash }).map((row) => row.owner);
  return owners.length === 0 ? 'nothing (an unused plan)' : owners.join(', ');
}

function movePlan(sql: Sql, hash: string, next: string, text: string): Counts {
  sql.run(
    'keep the compiled plan with wires',
    `insert into automation_plans (hash, kind, json, created_at)
     select $next, kind, $text, created_at from automation_plans where hash = $hash
     on conflict (hash) do nothing`,
    { hash, next, text },
  );
  for (const statement of PLAN_REFERENCES) {
    sql.run('point at the compiled plan with wires', statement, { hash, next });
  }
  sql.run(
    'drop the compiled plan with formulas',
    'delete from automation_plans where hash = $hash',
    {
      hash,
    },
  );
  return { plans: 1 };
}

function dropPlan(sql: Sql, hash: string): Counts {
  for (const statement of PLAN_RUN_REMOVALS) {
    sql.run('delete the records of runs of an old plan', statement, { hash });
  }
  const runs = sql.run('delete the runs of an old plan', PLAN_RUNS_REMOVAL, { hash });
  sql.run('delete an old plan', 'delete from automation_plans where hash = $hash', { hash });
  return { plansDeleted: 1, runsDeleted: runs };
}

function removable(sql: Sql, hash: string, pass: Pass): boolean {
  if (pass.kept.has(hash)) return false;
  if (pass.removed.has(hash)) return true;
  return (sql.get(COUNT, PLAN_RUN_COUNT, { hash })?.count ?? 0) === 0;
}

function planChange(sql: Sql, hash: string, text: string, pass: Pass): void {
  const rewritten = rewriteText(text);
  if (rewritten.formulas.length > 0) {
    if (removable(sql, hash, pass)) {
      pass.changes.push({ wires: 0, apply: () => dropPlan(sql, hash) });
      return;
    }
    pass.problems.push(
      `the compiled plan of ${planOwners(sql, hash)} (${rewritten.formulas.join(', ')})`,
    );
    return;
  }
  if (rewritten.wires === 0) return;
  const next = planHashOf(rewritten.value);
  const json = jsonText(rewritten.value);
  pass.changes.push({ wires: rewritten.wires, apply: () => movePlan(sql, hash, next, json) });
}

function tally(changes: readonly Change[]): LogPayload {
  const counts: Record<string, number> = { wires: 0 };
  for (const change of changes) {
    counts['wires'] = (counts['wires'] ?? 0) + change.wires;
    for (const [label, count] of Object.entries(change.apply())) {
      counts[label] = (counts[label] ?? 0) + count;
    }
  }
  return counts;
}

export function wirePortFormulas(sql: Sql): LogPayload {
  const pass: Pass = { changes: [], problems: [], kept: new Set(), removed: new Set() };
  for (const source of SOURCES) {
    for (const row of sql.all(STORED, source.select)) rewriteRow(sql, source, row, pass);
  }
  for (const row of sql.all(PLAN_ROW, 'select hash, json as text from automation_plans')) {
    planChange(sql, row.hash, row.text, pass);
  }
  if (pass.problems.length > 0) throw new FormulaLeftError(pass.problems);
  return tally(pass.changes);
}

export const PORT_WIRES_MIGRATION: Migration = {
  version: 133,
  name: 'port_wires',
  statements: [],
  backfill: wirePortFormulas,
};
