import { randomUUID } from 'node:crypto';
import {
  localClock,
  minuteOfClock,
  zonedInstant,
  type JsonValue,
  type SignalInput,
} from '@smarteverything/domain';
import type { Plan, PlanOp } from '@smarteverything/flow/compile/plan';
import { CORE_FRAMES, CORE_OPS } from '@smarteverything/flow/interpret/core-ops';
import type {
  Checked,
  Evaluated,
  NodeResult,
  ReadPort,
  StepContext,
} from '@smarteverything/flow/interpret/frames';
import { RUN_OPS } from '@smarteverything/flow/interpret/run-automation';
import { TRY_FRAMES, TRY_OPS } from '@smarteverything/flow/interpret/try';
import { waitOps } from '@smarteverything/flow/interpret/waits';
import { resolveBudgets } from '@smarteverything/flow/state/budgets';
import { ReadFailure } from '../../../src/automations/world-v3/read-port';
import type { SimEnv, SimStart } from '../../../src/automations/sim/rig';
import { stateAt } from '../driver/support';
import { NOW, furnish } from '../world/support';
import type { Home } from '../world/support';

export { NOW, furnish };
export type { Home };

let counter = 0;

function at(key: string): { id: string; key: string } {
  counter += 1;
  return { id: `node-${String(counter)}-${key}`, key };
}

export function seq(...ops: PlanOp[]): PlanOp {
  return { op: 'seq', ops };
}

export interface Marker {
  readonly op: PlanOp;
  readonly id: string;
}

export function send(
  key: string,
  kind = 'test.effect',
  params: Record<string, JsonValue> = {},
): Marker {
  const node = at(key);
  const lits = Object.fromEntries(Object.entries(params).map(([name, lit]) => [name, { lit }]));
  const op: PlanOp = {
    op: 'effect',
    at: node,
    kind,
    params: lits,
    retry: 'idempotent',
    budget: 'none',
  };
  return { op, id: node.id };
}

export function setDevice(key: string, device: string, to: JsonValue, control = 'power'): Marker {
  return send(key, 'device.set', { target: { device }, control, to });
}

export function pause(key: string, milliseconds: number): PlanOp {
  return {
    op: 'wait',
    at: at(key),
    durable: false,
    wait: { kind: 'duration', duration: { lit: milliseconds }, ifLate: 'run' },
  };
}

export function untilClock(key: string, clock: string): PlanOp {
  return {
    op: 'wait',
    at: at(key),
    durable: false,
    wait: { kind: 'until_instant', clock, ifLate: 'skip', graceMs: 0 },
  };
}

export function untilSignal(key: string, source: string, kind: string): PlanOp {
  return {
    op: 'wait',
    at: at(key),
    durable: false,
    wait: { kind: 'event', matcher: { source, kind } },
  };
}

export function runChild(key: string, automation: string, wait: boolean): PlanOp {
  return { op: 'run', at: at(key), automation, wait, allowSelf: false, inputs: {}, detached: true };
}

export function signal(source: string, kind: string, value: JsonValue): Omit<SignalInput, 'at'> {
  return {
    source,
    kind,
    subject: null,
    field: null,
    value,
    previous: null,
    profileId: null,
    data: {},
  };
}

function nextDaily(zone: string): (clock: JsonValue, after: number) => Checked<number> {
  return (clock, after) => {
    if (typeof clock !== 'string') return { ok: false, class: 'Invalid', message: 'a time of day' };
    const local = localClock(new Date(after), zone);
    const minute = minuteOfClock(clock);
    const today = zonedInstant(local, minute, zone);
    if (today.getTime() > after) return { ok: true, value: today.getTime() };
    const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    const day = {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
    };
    return { ok: true, value: zonedInstant(day, minute, zone).getTime() };
  };
}

function readPort(env: SimEnv, automationId: string): ReadPort {
  return {
    node: (request): NodeResult => {
      try {
        const { outputs } = env.reads.read(request.kind, request.inputs, {
          automationId,
          nodeId: request.node.id,
          nodeKey: request.node.key,
          seed: request.seed,
          activation: request.activation,
        });
        return { ok: true, value: outputs };
      } catch (cause) {
        if (cause instanceof ReadFailure) {
          return { ok: false, class: cause.errorClass, message: cause.message };
        }
        throw cause;
      }
    },
    variable: (): Evaluated => ({ ok: true, value: 0 }),
  };
}

function contextOf(body: PlanOp, env: SimEnv, automationId: string): StepContext {
  const plan: Plan = { version: 1, subject: 'automation', exits: [], variables: [], body };
  return {
    plan: () => plan,
    pure: () => undefined,
    reads: readPort(env, automationId),
    changeVar: () => ({ ok: true, value: { value: 0, wrapped: false } }),
    limits: resolveBudgets(),
    home: {},
    ops: {
      ...CORE_OPS,
      ...TRY_OPS,
      ...RUN_OPS,
      ...waitOps({ nextOccurrence: nextDaily(env.zone ?? 'UTC') }),
    },
    frames: { ...CORE_FRAMES, ...TRY_FRAMES },
  };
}

export function programOf(body: PlanOp, automationId: string = randomUUID()): SimStart {
  return {
    build: (runId, env, call) => ({
      state: {
        ...stateAt(env.clock.now().getTime()),
        runId,
        automationId,
        causeChain: call === null ? [] : call.causeChain,
      },
      context: contextOf(body, env, automationId),
      name: 'Simulated automation',
      kind: 'simulated',
      startedBy: null,
    }),
  };
}
