import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import type { StoreContext } from '../context';

export type PlanKind = 'automation' | 'function';

const STORED_PLAN = z.strictObject({
  hash: z.string(),
  kind: z.enum(['automation', 'function']),
  json: z.string(),
  created_at: z.string(),
});

export type StoredPlan = z.infer<typeof STORED_PLAN>;

function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, member]) => [key, canonical(member)]),
  );
}

function canonicalPlanText(plan: JsonValue): string {
  return JSON.stringify(canonical(plan));
}

export function planHashOf(plan: JsonValue): string {
  return createHash('sha256').update(canonicalPlanText(plan)).digest('hex');
}

export class AutomationPlansRepository {
  constructor(private readonly context: StoreContext) {}

  put(kind: PlanKind, plan: JsonValue): string {
    const text = canonicalPlanText(plan);
    const hash = createHash('sha256').update(text).digest('hex');
    this.context.write(() =>
      this.context.sql.run(
        'keep the compiled plan',
        `insert into automation_plans (hash, kind, json, created_at)
         values ($hash, $kind, $json, $now) on conflict (hash) do nothing`,
        { hash, kind, json: text, now: this.context.now() },
      ),
    );
    return hash;
  }

  find(hash: string): StoredPlan | undefined {
    return this.context.sql.get(
      STORED_PLAN,
      'select hash, kind, json, created_at from automation_plans where hash = $hash',
      { hash },
    );
  }

  has(hash: string): boolean {
    return this.find(hash) !== undefined;
  }

  sweepOrphans(createdBefore: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'sweep the unused compiled plans',
        `delete from automation_plans
         where created_at < $createdBefore
           and hash not in (select plan_hash from automation_revisions)
           and hash not in (select plan_hash from automation_function_revisions)
           and hash not in (select plan_hash from automation_runs)`,
        { createdBefore },
      ),
    );
  }
}
