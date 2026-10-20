import type { PortValue, Variable, Wire } from '@smarteverything/domain';
import { wireOf } from '../check/references';
import type { ManifestKinds } from './manifest';
import { kindOf, planOps, portsOf } from './manifest';
import type { Plan, PlanOp } from './plan';
import type { At } from './plan-parts';

export const ZONE_KEY = 'home:zone';
export const CONDITION_PORT = 'condition';
export const COLLECT_PORT = 'collect';

export interface ReadSite {
  readonly at: At;
  readonly port: string;
  readonly keys: readonly string[];
}

type Producer = Extract<PlanOp, { op: 'read' | 'compute' }>;

export interface Index {
  readonly producers: ReadonlyMap<string, Producer>;
  readonly variables: readonly Variable[];
}

interface Trace {
  readonly index: Index;
  readonly keys: Set<string>;
  readonly visited: Set<string>;
}

export function readIndex(plan: Plan): Index {
  const producers = new Map<string, Producer>();
  for (const op of planOps(plan)) {
    if (op.op === 'read' || op.op === 'compute') producers.set(op.at.key, op);
  }
  return { producers, variables: plan.variables };
}

function variableKey(variables: readonly Variable[], name: string): string {
  const persistent = variables.find((variable) => variable.name === name)?.persist === true;
  return `${persistent ? 'persistent' : 'run'}:${name}`;
}

function rootKeys(wire: Wire, variables: readonly Variable[]): string[] {
  if (wire.from === 'vars') return [variableKey(variables, wire.port)];
  return wire.from === 'home' && wire.port === 'timeZone' ? [ZONE_KEY] : [];
}

function traceValue(value: PortValue, trace: Trace): void {
  const wire = wireOf(value);
  if (wire === undefined) return;
  for (const key of rootKeys(wire, trace.index.variables)) trace.keys.add(key);
  const producer = trace.index.producers.get(wire.from);
  if (producer !== undefined) traceProducer(producer, trace);
}

function traceProducer(producer: Producer, trace: Trace): void {
  if (trace.visited.has(producer.at.key)) return;
  trace.visited.add(producer.at.key);
  if (producer.op === 'read') for (const key of producer.reads) trace.keys.add(key);
  for (const value of Object.values(producer.ports)) traceValue(value, trace);
}

export function dependencyKeys(index: Index, value: PortValue): readonly string[] {
  const trace: Trace = { index, keys: new Set(), visited: new Set() };
  traceValue(value, trace);
  return [...trace.keys].sort();
}

interface Candidate {
  readonly at: At;
  readonly port: string;
  readonly value: PortValue;
}

function livePorts(op: PlanOp, kinds: ManifestKinds): readonly Candidate[] {
  const owned = portsOf(op);
  if (owned === undefined) return [];
  return kindOf(kinds, owned.kind).inputs.flatMap((decl) => {
    const value = owned.ports[decl.name];
    return decl.live === true && value !== undefined
      ? [{ at: owned.at, port: decl.name, value }]
      : [];
  });
}

function controlPorts(op: PlanOp): readonly Candidate[] {
  if (op.op === 'wait' && op.wait.kind === 'condition') {
    return [{ at: op.at, port: CONDITION_PORT, value: op.wait.condition }];
  }
  if (op.op !== 'loop') return [];
  const test =
    op.test === undefined ? [] : [{ at: op.at, port: CONDITION_PORT, value: op.test.when }];
  const collect =
    op.source.kind === 'items' && op.source.collect !== undefined
      ? [{ at: op.at, port: COLLECT_PORT, value: op.source.collect }]
      : [];
  return [...test, ...collect];
}

export function readSites(plan: Plan, kinds: ManifestKinds): readonly ReadSite[] {
  const index = readIndex(plan);
  return planOps(plan)
    .flatMap((op) => [...livePorts(op, kinds), ...controlPorts(op)])
    .map(({ at, port, value }) => ({ at, port, keys: dependencyKeys(index, value) }));
}
