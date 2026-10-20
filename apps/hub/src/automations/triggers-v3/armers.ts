import {
  DEVICE_MATCHER_MAPPINGS,
  compileTriggerMatcher,
  type JsonValue,
  type Place,
  type SignalInput,
  type SignalMatcher,
  type TriggerNode,
} from '@smarteverything/domain';
import type { Cancel, Clock } from '../../clock';
import type { WatchedAutomation, WatchedTrigger } from '../../signals/signal-watchers';
import { CONDITION_TRIGGER_KIND, compileCondition } from './condition-triggers';
import { signalPayload, timedPayload, type TriggerFire } from './payload';
import { TIMED_COMPILERS, type Schedule } from './schedules';
import { WEBHOOK_TRIGGER_KIND, webhookPathProblem } from './webhook-path';
import type { ConditionEntry, TriggerIdentity as Identity, TriggerProblem } from './trigger-types';

export type { TriggerProblem } from './trigger-types';

interface SignalEntry extends Identity {
  readonly matcher: SignalMatcher;
}

interface TimedEntry extends Identity {
  readonly schedule: Schedule;
}

export interface CompiledTriggers {
  readonly automationId: string;
  readonly signals: readonly SignalEntry[];
  readonly timed: readonly TimedEntry[];
  readonly conditions: readonly ConditionEntry[];
  readonly problems: readonly TriggerProblem[];
}

export interface ArmDeps {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly place: () => Place | null;
  readonly fire: (fire: TriggerFire) => void;
  readonly problem: (problem: TriggerProblem) => void;
}

type Ports = Readonly<Record<string, JsonValue>>;

function literalPorts(node: TriggerNode): Ports | string {
  const ports: Record<string, JsonValue> = {};
  for (const [name, port] of Object.entries(node.ports)) {
    if (!('lit' in port)) return `${name} must be a fixed value on a ${node.kind} trigger`;
    ports[name] = port.lit;
  }
  return ports;
}

function identityOf(automationId: string, node: TriggerNode): Identity {
  return { automationId, triggerId: node.id, key: node.key, kind: node.kind };
}

interface Compiled {
  readonly signal?: SignalEntry;
  readonly timed?: TimedEntry;
  readonly condition?: ConditionEntry;
  readonly problem?: string;
}

function compileOne(automationId: string, node: TriggerNode): Compiled {
  if (node.kind === CONDITION_TRIGGER_KIND) return compileCondition(automationId, node);
  const ports = literalPorts(node);
  if (typeof ports === 'string') return { problem: ports };
  const pathProblem = node.kind === WEBHOOK_TRIGGER_KIND ? webhookPathProblem(ports) : null;
  if (pathProblem !== null) return { problem: pathProblem };
  const identity = identityOf(automationId, node);
  const timed = TIMED_COMPILERS[node.kind];
  if (timed !== undefined) {
    const schedule = timed(ports);
    return schedule.ok
      ? { timed: { ...identity, schedule: schedule.value } }
      : { problem: schedule.error };
  }
  if (!Object.hasOwn(DEVICE_MATCHER_MAPPINGS, node.kind)) return {};
  const matcher = compileTriggerMatcher(node.kind, ports);
  return matcher.ok
    ? { signal: { ...identity, matcher: matcher.matcher } }
    : { problem: matcher.error };
}

export function compileTriggers(
  automationId: string,
  nodes: readonly TriggerNode[],
): CompiledTriggers {
  const signals: SignalEntry[] = [];
  const timed: TimedEntry[] = [];
  const conditions: ConditionEntry[] = [];
  const problems: TriggerProblem[] = [];
  for (const node of nodes.filter((entry) => entry.enabled !== false)) {
    const compiled = compileOne(automationId, node);
    if (compiled.signal !== undefined) signals.push(compiled.signal);
    if (compiled.timed !== undefined) timed.push(compiled.timed);
    if (compiled.condition !== undefined) conditions.push(compiled.condition);
    if (compiled.problem !== undefined)
      problems.push({ automationId, triggerId: node.id, message: compiled.problem });
  }
  return { automationId, signals, timed, conditions, problems };
}

export function watchedOf(
  compiled: CompiledTriggers,
  isPulse: (matcher: SignalMatcher) => boolean,
): WatchedAutomation {
  const triggers: WatchedTrigger[] = compiled.signals.map((entry) => ({
    triggerId: entry.triggerId,
    matcher: entry.matcher,
    pulse: isPulse(entry.matcher),
  }));
  return { automationId: compiled.automationId, triggers };
}

export function signalFire(
  compiled: CompiledTriggers,
  signal: SignalInput,
  triggerId: string,
): TriggerFire | null {
  const entry = compiled.signals.find((candidate) => candidate.triggerId === triggerId);
  if (entry === undefined) return null;
  return {
    automationId: entry.automationId,
    triggerId: entry.triggerId,
    key: entry.key,
    kind: entry.kind,
    at: signal.at,
    payload: signalPayload(entry.kind, signal),
  };
}

function failureText(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'The next time could not be worked out';
}

function dueAfter(entry: TimedEntry, after: Date, deps: ArmDeps): Date | string {
  const place = deps.place();
  if (place === null) return 'The home has no time zone yet';
  try {
    const now = deps.clock.now();
    const next = entry.schedule.next(after, place);
    const due =
      next !== null && next.getTime() <= now.getTime() ? entry.schedule.next(now, place) : next;
    return due ?? 'This trigger is never due';
  } catch (cause) {
    return failureText(cause);
  }
}

function armTimed(entry: TimedEntry, deps: ArmDeps): Cancel {
  let cancel: Cancel = (): void => undefined;
  let tick = 0;
  const schedule = (after: Date): void => {
    const due = dueAfter(entry, after, deps);
    if (typeof due === 'string') {
      deps.problem({ automationId: entry.automationId, triggerId: entry.triggerId, message: due });
      return;
    }
    cancel = deps.clock.at(due, () => {
      schedule(due);
      tick += 1;
      const now = deps.clock.now();
      deps.fire({
        automationId: entry.automationId,
        triggerId: entry.triggerId,
        key: entry.key,
        kind: entry.kind,
        at: now.toISOString(),
        payload: timedPayload(now, due, entry.schedule.extra(tick, due)),
      });
    });
  };
  schedule(deps.clock.now());
  return (): void => {
    cancel();
  };
}

export function armTimedTriggers(compiled: CompiledTriggers, deps: ArmDeps): Cancel {
  for (const problem of compiled.problems) deps.problem(problem);
  const cancels = compiled.timed.map((entry) => armTimed(entry, deps));
  return (): void => {
    for (const cancel of cancels) cancel();
  };
}
