import type { ErrorClass, JsonValue, PortValue, StructuredOutput } from '@smarteverything/domain';
import type { Plan, PlanOp } from '../../src/compile/plan';
import type { At } from '../../src/compile/plan-parts';
import { resolveBudgets, startBudgets } from '../../src/state/budgets';
import { RUN_STATE } from '../../src/state/run-state';
import type { RunState } from '../../src/state/run-state';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import { rootFrame } from '../../src/interpret/frames';
import type {
  Evaluated,
  NodeResult,
  Outcome,
  PortThunks,
  PureEvaluator,
  VarChangeResult,
  StepContext,
  StepEvent,
  StepRecord,
} from '../../src/interpret/frames';
import type { EffectRequest } from '../../src/interpret/frames';
import { step } from '../../src/interpret/step';
import { pureEvaluators } from '../../src/nodes/pure';

export const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

let counter = 0;

export function uuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

export const lit = (value: JsonValue): PortValue => ({ lit: value });
export const wired = (reference: string): PortValue => {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
};

export function at(key: string): At {
  return { id: uuid(), key };
}

export function seq(...ops: PlanOp[]): PlanOp {
  return { op: 'seq', ops };
}

type Kind<K extends PlanOp['op']> = Extract<PlanOp, { op: K }>;

export function compute(key: string, kind: string, ports: Record<string, PortValue>): PlanOp {
  return { op: 'compute', at: at(key), kind, ports };
}

export function broken(): PlanOp {
  return compute('broken', 'test.fail', {});
}

export const BROKEN = wired('broken.value');

export function plus(key: string, source: string, amount: number): PlanOp {
  return compute(key, 'test.add', { a: wired(source), b: lit(amount) });
}

export function readOp(key: string, ports: Record<string, PortValue> = {}): PlanOp {
  return { op: 'read', at: at(key), kind: 'test.read', ports, reads: [] };
}

export function effect(
  key: string,
  params: Record<string, PortValue> = {},
  extra: Partial<Kind<'effect'>> = {},
): PlanOp {
  return {
    op: 'effect',
    at: at(key),
    kind: 'test.effect',
    params,
    retry: 'idempotent',
    budget: 'none',
    ...extra,
  };
}

export function branch(
  key: string,
  rows: readonly [string, PortValue, PlanOp][],
  otherwise?: PlanOp,
  outputs?: StructuredOutput[],
): PlanOp {
  return {
    op: 'branch',
    at: at(key),
    rows: rows.map(([id, when, then]) => ({ id, when, then })),
    else: otherwise,
    outputs,
  };
}

export function switchOp(
  key: string,
  subject: PortValue,
  cases: readonly [string, Kind<'switch'>['cases'][number]['match'], PlanOp][],
  extra: Partial<Kind<'switch'>> = {},
): PlanOp {
  return {
    op: 'switch',
    at: at(key),
    subject,
    mode: 'first',
    cases: cases.map(([id, match, then]) => ({ id, match, then })),
    ...extra,
  };
}

export function guard(key: string, condition: PortValue, quietly = true): PlanOp {
  return { op: 'guard', at: at(key), condition, quietly };
}

export function setVar(key: string, extra: Partial<Kind<'set_var'>>): PlanOp {
  return {
    op: 'set_var',
    at: at(key),
    mode: 'set',
    source: 'run',
    retry: 'idempotent',
    budget: 'none',
    ...extra,
  };
}

export function ret(values: Record<string, PortValue> = {}, exit?: string): PlanOp {
  return { op: 'return', at: at('return'), exit, values };
}

export function stop(extra: Partial<Kind<'stop'>> = {}): PlanOp {
  return { op: 'stop', at: at('stop'), failed: false, cancelSelf: false, ...extra };
}

export function fail(message: PortValue, extra: Partial<Kind<'fail'>> = {}): PlanOp {
  return { op: 'fail', at: at('fail'), class: 'Failed', message, ...extra };
}

export function output(name: string, values: Record<string, PortValue>): StructuredOutput {
  return { name, values };
}

export function planOf(body: PlanOp, extra: Partial<Plan> = {}): Plan {
  return { version: 1, subject: 'automation', exits: [], variables: [], body, ...extra };
}

export function stateOf(overrides: Partial<RunState> = {}): RunState {
  const automationId = uuid();
  return {
    runId: uuid(),
    automationId,
    revision: 1,
    planRefs: [{ id: automationId, revision: 1, hash: 'a'.repeat(64) }],
    trigger: null,
    payload: {},
    ownerProfileId: null,
    origin: null,
    causeChain: [],
    frames: [rootFrame()],
    captures: {},
    budgets: startBudgets(resolveBudgets(), NOW),
    seed: 7,
    ...overrides,
    inputs: { n: 0, ...overrides.inputs },
  };
}

const REAL_NODES = pureEvaluators({ timeZone: 'UTC', now: () => NOW, trigger: () => null });

export interface Spy {
  pure: string[];
  reads: string[];
  variables: string[];
  changes: string[];
}

export function spy(): Spy {
  return { pure: [], reads: [], variables: [], changes: [] };
}

function numberOf(value: Evaluated | undefined): number {
  return value?.ok === true && typeof value.value === 'number' ? value.value : 0;
}

type PureFn = (ports: PortThunks) => NodeResult;

function pureKinds(log: Spy): Record<string, PureFn> {
  return {
    'test.add': (ports): NodeResult => {
      log.pure.push('add');
      return {
        ok: true,
        value: { value: numberOf(ports.get('a')) + numberOf(ports.get('b')) },
      };
    },
    'test.select': (ports): NodeResult => {
      log.pure.push('select');
      const condition = ports.get('condition');
      if (condition?.ok !== true)
        return condition ?? { ok: false, class: 'Invalid', message: 'no condition' };
      const chosen = ports.get(condition.value === true ? 'whenTrue' : 'whenFalse');
      if (chosen?.ok !== true) return chosen ?? { ok: false, class: 'Invalid', message: 'no side' };
      return { ok: true, value: chosen.value === undefined ? {} : { value: chosen.value } };
    },
    'test.fail': () => ({ ok: false, class: 'MathError', message: 'boom' }),
    'test.concat': (ports): NodeResult => {
      const a = ports.get('a');
      const b = ports.get('b');
      return {
        ok: true,
        value: {
          value: `${String(a?.ok === true ? a.value : '')}${String(b?.ok === true ? b.value : '')}`,
        },
      };
    },
  };
}

export function contextOf(
  plan: Plan,
  log: Spy = spy(),
  extra: Partial<StepContext> = {},
): StepContext {
  const kinds = pureKinds(log);
  return {
    plan: () => plan,
    pure: (kind): PureEvaluator | undefined => {
      const evaluate = kinds[kind];
      return evaluate === undefined
        ? REAL_NODES(kind)
        : { evaluate: (request) => evaluate(request.ports) };
    },
    reads: {
      node: (): NodeResult => {
        log.reads.push('read');
        return { ok: true, value: { value: log.reads.length } };
      },
      variable: (name): Evaluated => {
        log.variables.push(name);
        return { ok: true, value: log.variables.length * 100 };
      },
    },
    changeVar: (request): VarChangeResult => {
      log.changes.push(request.change.op);
      const current = typeof request.current === 'number' ? request.current : 0;
      const amount = typeof request.amount === 'number' ? request.amount : 1;
      return {
        ok: true,
        value: { value: current + amount, previous: request.current, wrapped: false },
      };
    },
    limits: resolveBudgets(),
    home: { timeZone: 'Asia/Bangkok', name: 'Home' },
    ops: CORE_OPS,
    frames: CORE_FRAMES,
    ...extra,
  };
}

export interface Trace {
  readonly state: RunState;
  readonly outcome: Outcome;
  readonly records: readonly StepRecord[];
  readonly nodes: readonly Extract<StepRecord, { kind: 'node' }>[];
  readonly requests: readonly EffectRequest[];
  readonly steps: number;
}

export interface RunOptions {
  readonly resolve?: (request: EffectRequest) => NodeResult;
  readonly start?: boolean;
  readonly limit?: number;
}

type NodeRecord = Extract<StepRecord, { kind: 'node' }>;

function sortRecords(
  stepped: readonly StepRecord[],
  records: StepRecord[],
  nodes: NodeRecord[],
): void {
  for (const entry of stepped) {
    if (entry.kind === 'node') nodes.push(entry);
    else records.push(entry);
  }
}

export function run(ctx: StepContext, initial: RunState, options: RunOptions = {}): Trace {
  const requests: EffectRequest[] = [];
  const records: StepRecord[] = [];
  const nodes: Extract<StepRecord, { kind: 'node' }>[] = [];
  let state = initial;
  let event: StepEvent = { kind: options.start === false ? 'run' : 'start', now: NOW };
  for (let steps = 1; steps <= (options.limit ?? 10_000); steps += 1) {
    const stepped = step(ctx, state, event);
    RUN_STATE.parse(JSON.parse(JSON.stringify(stepped.state)));
    state = stepped.state;
    sortRecords(stepped.records, records, nodes);
    const { outcome } = stepped;
    if (outcome.kind === 'effect' && options.resolve !== undefined) {
      requests.push(outcome.request);
      event = { kind: 'resolved', now: NOW, result: options.resolve(outcome.request) };
      continue;
    }
    if (outcome.kind === 'effect') requests.push(outcome.request);
    if (outcome.kind !== 'continue') return { state, outcome, records, nodes, requests, steps };
    event = { kind: 'run', now: NOW };
  }
  throw new Error('the run did not stop');
}

export function failedClass(trace: Trace): ErrorClass | undefined {
  return trace.outcome.kind === 'failed' ? trace.outcome.error.class : undefined;
}
