import { NODE_REGISTRY } from '@smarteverything/domain';
import type { BudgetOverrides, FlowType, JsonValue, RefKind } from '@smarteverything/domain';
import type { Plan } from '@smarteverything/flow/compile/plan';
import { CALL_FRAMES, callOps, planOwner } from '@smarteverything/flow/interpret/calls';
import { CORE_FRAMES, CORE_OPS } from '@smarteverything/flow/interpret/core-ops';
import {
  CONCURRENT_EACH_FRAMES,
  CONCURRENT_EACH_OPS,
} from '@smarteverything/flow/interpret/for-each-concurrent';
import type {
  Checked,
  Evaluated,
  NodeResult,
  Outputs,
  ReadPort,
  StepContext,
  VarChangeRequest,
  VarChangeResult,
} from '@smarteverything/flow/interpret/frames';
import { LOOP_FRAMES, LOOP_OPS } from '@smarteverything/flow/interpret/loops';
import { PARALLEL_FRAMES, PARALLEL_OPS } from '@smarteverything/flow/interpret/parallel';
import { withPolicy } from '@smarteverything/flow/interpret/policy';
import { RUN_OPS } from '@smarteverything/flow/interpret/run-automation';
import { TRY_FRAMES, TRY_OPS } from '@smarteverything/flow/interpret/try';
import { stateOps } from '@smarteverything/flow/interpret/state-ops';
import type { StateMemoryPort } from '@smarteverything/flow/interpret/state-ops';
import { waitOps } from '@smarteverything/flow/interpret/waits';
import type { ZonePort } from '@smarteverything/flow/interpret/waits';
import { pureEvaluators } from '@smarteverything/flow/nodes/pure/index';
import type { LocalTime, StateClock } from '@smarteverything/flow/nodes/state/adapter';
import { changeVariable } from '@smarteverything/flow/nodes/state/var-change';
import { resolveBudgets } from '@smarteverything/flow/state/budgets';
import { localClock, minuteOfClock, zonedInstant } from '@smarteverything/domain';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { CalleeLookup } from './engine-v3-start';
import type { PersistentVariables } from './world-v3/variables';
import { ReadFailure, keptOf } from './world-v3/read-port';
import type { WorldReads } from './world-v3/read-port';

export interface ContextPorts {
  readonly reads: WorldReads;
  readonly clock: Pick<Clock, 'now'>;
  readonly zone: () => string;
  readonly persistent: PersistentVariables;
  readonly stateMemory: StateMemoryPort;
}

export interface ContextSubject {
  readonly automationId: string;
  readonly plan: Plan;
  readonly lookup: CalleeLookup;
  readonly budgets: BudgetOverrides | undefined;
  readonly triggerKey: string | null;
}

export function homeRoot(zone: () => string): { readonly timeZone: string } {
  return { timeZone: zone() };
}

function referenceKind(type: FlowType | undefined): RefKind | undefined {
  if (type?.t === 'optional') return referenceKind(type.of);
  return type?.t === 'ref' && type.of !== 'target' ? type.of : undefined;
}

function withReferences(kind: string, inputs: Outputs): Outputs {
  const declared = NODE_REGISTRY.get(kind)?.inputs ?? [];
  return Object.fromEntries(
    Object.entries(inputs).map(([name, value]): [string, JsonValue] => {
      const of =
        typeof value === 'string'
          ? referenceKind(declared.find((port) => port.name === name)?.type)
          : undefined;
      return [name, of === undefined ? value : { [of]: value }];
    }),
  );
}

export function readPort(
  ports: Pick<ContextPorts, 'reads' | 'persistent'>,
  automationId: string,
): ReadPort {
  return {
    node: (request): NodeResult => {
      try {
        const { outputs } = ports.reads.read(
          request.kind,
          withReferences(request.kind, request.inputs),
          {
            automationId,
            nodeId: request.node.id,
            nodeKey: request.node.key,
            seed: request.seed,
            activation: request.activation,
            kept: keptOf(request.kept),
          },
        );
        return { ok: true, value: outputs };
      } catch (cause) {
        if (cause instanceof ReadFailure) {
          return { ok: false, class: cause.errorClass, message: cause.message };
        }
        throw cause;
      }
    },
    variable: (name, kept): Evaluated => ({
      ok: true,
      value: ports.persistent.read(automationId, name, kept)?.value,
    }),
  };
}

function changer(request: VarChangeRequest): VarChangeResult {
  const { change, current, amount } = request;
  const result = changeVariable(current, {
    op: changeOp(change.op),
    edge: change.edge,
    ...(change.field === undefined ? {} : { field: change.field }),
    ...(change.steps === undefined ? {} : { steps: z.array(z.json()).parse(change.steps) }),
    ...(amount === undefined ? {} : { amount: z.json().parse(amount) }),
  });
  if (!result.ok) return { ok: false, class: result.errorClass, message: result.message };
  return { ok: true, value: result };
}

const CHANGE_OPS = [
  'toggle',
  'add',
  'subtract',
  'multiply',
  'next',
  'previous',
  'append',
  'remove',
  'set_field',
] as const;

function changeOp(op: string): (typeof CHANGE_OPS)[number] {
  const known = CHANGE_OPS.find((candidate) => candidate === op);
  if (known === undefined) throw new RangeError(`${op} is not a variable operation`);
  return known;
}

function nextOccurrence(zone: () => string): ZonePort['nextOccurrence'] {
  return (clock, after): Checked<number> => {
    if (typeof clock !== 'string') return { ok: false, class: 'Invalid', message: 'a time of day' };
    const place = zone();
    const local = localClock(new Date(after), place);
    const minute = minuteOfClock(clock);
    const today = zonedInstant(local, minute, place);
    if (today.getTime() > after) return { ok: true, value: today.getTime() };
    const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    const day = {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
    };
    return { ok: true, value: zonedInstant(day, minute, place).getTime() };
  };
}

function stateClock(zone: () => string): StateClock {
  return {
    localTime: (at): LocalTime => {
      const local = localClock(new Date(at), zone());
      return {
        msOfDay: local.minuteOfDay * 60_000 + (at % 60_000),
        localAsUtc: new Date(
          Date.UTC(local.year, local.month - 1, local.day, 0, local.minuteOfDay),
        ),
      };
    },
  };
}

function planFor(subject: ContextSubject): StepContext['plan'] {
  return (frame, state) => {
    const owner = planOwner(state, frame);
    if (owner === null) return subject.plan;
    const ref = state.planRefs.find(
      (held) => held.id === owner.id && held.revision === owner.revision,
    );
    if (ref === undefined) {
      throw new RangeError(`the Custom Node ${owner.id} is not pinned in run ${state.runId}`);
    }
    return subject.lookup.plan(ref.hash);
  };
}

export function stepContext(subject: ContextSubject, ports: ContextPorts): StepContext {
  return {
    plan: planFor(subject),
    pure: pureEvaluators({
      timeZone: ports.zone(),
      now: () => ports.clock.now().getTime(),
      trigger: () => subject.triggerKey,
    }),
    reads: readPort(ports, subject.automationId),
    changeVar: changer,
    limits: resolveBudgets(subject.budgets),
    home: homeRoot(ports.zone),
    ops: withPolicy({
      ...CORE_OPS,
      ...TRY_OPS,
      ...LOOP_OPS,
      ...PARALLEL_OPS,
      ...RUN_OPS,
      ...callOps((ref) => subject.lookup.interface(ref)),
      ...waitOps({ nextOccurrence: nextOccurrence(ports.zone) }),
      ...stateOps({ memory: ports.stateMemory, clock: stateClock(ports.zone) }),
      ...CONCURRENT_EACH_OPS,
    }),
    frames: {
      ...CORE_FRAMES,
      ...TRY_FRAMES,
      ...LOOP_FRAMES,
      ...PARALLEL_FRAMES,
      ...CONCURRENT_EACH_FRAMES,
      ...CALL_FRAMES,
    },
  };
}
