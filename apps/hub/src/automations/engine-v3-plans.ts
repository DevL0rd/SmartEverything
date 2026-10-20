import { ApiError, NODE_REGISTRY } from '@smarteverything/domain';
import type { AutomationRowV3 } from '@smarteverything/domain';
import { callsIn } from '@smarteverything/flow/compile/manifest';
import { lower } from '@smarteverything/flow/compile/lower';
import { PLAN } from '@smarteverything/flow/compile/plan';
import type { Plan } from '@smarteverything/flow/compile/plan';
import { interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import type { FunctionInterface } from '@smarteverything/flow/functions/interface-hash';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { PlanRef } from '@smarteverything/flow/state/run-state';
import type { Logger } from '@smarteverything/logging';
import type { AutomationFunctionsRepository } from '../store/repositories/automation-functions';
import type { AutomationOwnedValuesRepository } from '../store/repositories/automation-owned-values';
import type { AutomationPlansRepository } from '../store/repositories/automation-plans';
import { jsonRecord } from './engine-v3-start';
import type { CalleeLookup, Subject } from './engine-v3-start';

export interface PlanRepositories {
  readonly plans: Pick<AutomationPlansRepository, 'put' | 'find' | 'has'>;
  readonly owned: Pick<AutomationOwnedValuesRepository, 'list' | 'create'>;
  readonly functions: Pick<AutomationFunctionsRepository, 'find' | 'latest' | 'findRevision'>;
}

export class PlanBook implements CalleeLookup {
  private readonly cache = new Map<string, Plan>();

  constructor(
    private readonly repositories: PlanRepositories,
    private readonly log: Logger,
  ) {}

  compile(row: AutomationRowV3): Subject | undefined {
    const lowered = lower(row.definition, { kinds: (id) => NODE_REGISTRY.get(id) });
    if (!lowered.ok) {
      this.log.warn('automation.not_loaded', {
        automationId: row.id,
        problems: lowered.problems.map((problem) => problem.message),
      });
      return undefined;
    }
    const hash = this.repositories.plans.put('automation', jsonRecord(lowered.plan));
    this.cache.set(hash, lowered.plan);
    const subject: Subject = {
      id: row.id,
      name: row.name,
      revision: row.revision,
      row,
      program: row.definition,
      hash,
      plan: lowered.plan,
      callees: this.calleesOf(lowered.plan),
      lookup: this,
    };
    this.ensureVariables(subject);
    return subject;
  }

  stored(hash: string): Plan {
    const cached = this.cache.get(hash);
    if (cached !== undefined) return cached;
    const found = this.repositories.plans.find(hash);
    if (found === undefined) throw new ApiError('not_found', `The plan ${hash} is not stored.`);
    const plan = PLAN.parse(JSON.parse(found.json));
    this.cache.set(hash, plan);
    return plan;
  }

  plan(hash: string): Plan {
    return this.stored(hash);
  }

  interface(ref: PlanRef): Checked<FunctionInterface> {
    const row = this.repositories.functions.findRevision(ref.id, ref.revision);
    if (row === undefined) {
      return {
        ok: false,
        class: 'NotFound',
        message: `the Custom Node ${ref.id} revision ${String(ref.revision)} no longer exists`,
      };
    }
    return { ok: true, value: interfaceOf(row.definition) };
  }

  calleesOf(plan: Plan): readonly PlanRef[] {
    const found = new Map<string, PlanRef>();
    const visit = (current: Plan): void => {
      for (const callee of callsIn(current)) {
        const { functions } = this.repositories;
        const row =
          callee.pin !== undefined
            ? functions.findRevision(callee.fn, callee.pin)
            : functions.find(callee.fn) === undefined
              ? undefined
              : functions.latest(callee.fn);
        if (row === undefined) continue;
        const key = `${callee.fn}@${String(row.revision)}`;
        if (found.has(key)) continue;
        found.set(key, { id: callee.fn, revision: row.revision, hash: row.plan_hash });
        visit(this.stored(row.plan_hash));
      }
    };
    visit(plan);
    return [...found.values()];
  }

  private ensureVariables(subject: Subject): void {
    const { owned } = this.repositories;
    for (const variable of subject.program.variables) {
      if (variable.persist !== true || !('lit' in variable.initial)) continue;
      if (owned.list(subject.id).some((row) => row.content.name === variable.name)) continue;
      owned.create(subject.id, {
        kind: 'typed',
        name: variable.name,
        type: variable.type,
        value: variable.initial.lit,
      });
    }
  }
}
