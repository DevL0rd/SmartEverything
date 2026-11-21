import { ApiError } from '@smarteverything/domain';
import type { NodeKindLookup, StoredAutomationRow } from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import type { Plan } from '@smarteverything/flow/compile/plan';
import type { FunctionInterface } from '@smarteverything/flow/functions/interface-hash';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { PlanRef } from '@smarteverything/flow/state/run-state';
import type { Logger } from '@smarteverything/logging';
import { readAutomation } from '../store/repositories/automation-trees';
import type { AutomationMemory } from './automation-memory';
import type { EngineStore } from './engine-store';
import { interfaceKey, type PersistedVariable, type PlanBundle } from './engine-units';
import { jsonRecord } from './engine-v3-start';
import type { CalleeLookup, Subject } from './engine-v3-start';

export interface PlanBookPorts {
  readonly store: Pick<EngineStore, 'prepare' | 'callees' | 'stored'>;
  readonly memory: Pick<AutomationMemory, 'mark' | 'hold'>;
}

function persistedVariables(subject: Pick<Subject, 'program'>): readonly PersistedVariable[] {
  return subject.program.variables.flatMap((variable) =>
    variable.persist === true && 'lit' in variable.initial
      ? [{ name: variable.name, type: variable.type, value: variable.initial.lit }]
      : [],
  );
}

export class PlanBook implements CalleeLookup {
  private readonly plans = new Map<string, Plan>();
  private readonly interfaces = new Map<string, FunctionInterface>();

  constructor(
    private readonly ports: PlanBookPorts,
    private readonly log: Logger,
    private readonly kinds: NodeKindLookup,
  ) {}

  async compile(row: StoredAutomationRow): Promise<Subject | undefined> {
    const read = readAutomation(row.definition, this.kinds);
    if (!read.ok) {
      this.log.warn('automation.not_loaded', {
        automationId: row.id,
        problems: read.problems.map((problem) => problem.message),
      });
      return undefined;
    }
    const lowered = lower(read.tree, { kinds: (id) => this.kinds.get(id) });
    if (!lowered.ok) {
      this.log.warn('automation.not_loaded', {
        automationId: row.id,
        problems: lowered.problems.map((problem) => problem.message),
      });
      return undefined;
    }
    const since = this.ports.memory.mark();
    const prepared = await this.ports.store.prepare({
      automationId: row.id,
      plan: jsonRecord(lowered.plan),
      variables: persistedVariables({ program: read.tree }),
    });
    this.ports.memory.hold(row.id, prepared.memory, since);
    this.plans.set(prepared.hash, lowered.plan);
    this.take(prepared);
    return {
      id: row.id,
      name: row.name,
      revision: row.revision,
      row,
      program: read.tree,
      hash: prepared.hash,
      plan: lowered.plan,
      callees: prepared.refs,
      lookup: this,
    };
  }

  async callees(plan: Plan): Promise<readonly PlanRef[]> {
    const found = await this.ports.store.callees(jsonRecord(plan));
    this.take(found);
    return found.refs;
  }

  async load(refs: readonly PlanRef[]): Promise<void> {
    this.take(
      await this.ports.store.stored({
        hashes: refs.map((ref) => ref.hash),
        functions: refs.map(({ id, revision }) => ({ id, revision })),
      }),
    );
  }

  has(hash: string): boolean {
    return this.plans.has(hash);
  }

  stored(hash: string): Plan {
    const found = this.plans.get(hash);
    if (found === undefined) throw new ApiError('not_found', `The plan ${hash} is not stored.`);
    return found;
  }

  plan(hash: string): Plan {
    return this.stored(hash);
  }

  interface(ref: PlanRef): Checked<FunctionInterface> {
    const found = this.interfaces.get(interfaceKey(ref.id, ref.revision));
    if (found === undefined) {
      return {
        ok: false,
        class: 'NotFound',
        message: `the Custom Node ${ref.id} revision ${String(ref.revision)} no longer exists`,
      };
    }
    return { ok: true, value: found };
  }

  private take(bundle: PlanBundle): void {
    for (const [hash, plan] of Object.entries(bundle.plans)) this.plans.set(hash, plan);
    for (const [key, found] of Object.entries(bundle.interfaces)) this.interfaces.set(key, found);
  }
}
