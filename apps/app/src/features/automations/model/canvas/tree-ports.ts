import type { FlowType, PortValue } from '@smarteverything/domain';
import { portText as domainPortText, typeDisplayName } from '@smarteverything/domain';
import type { EdgeEnd, PortShape, ProblemInput, ScenePort } from './contract';
import type { Env, KindView } from './tree-env';
import { kindView, valueWords } from './tree-env';
import type { Reference } from './references';
import type { Request } from './tree-requests';
import { referencesOf } from './references';

export interface Source {
  readonly nodeId: string;
  readonly output: string;
  readonly valueKey: string | null;
}

const SHAPE_BY_TYPE: Partial<Record<FlowType['t'], PortShape>> = {
  list: 'diamond',
  record: 'square',
  ref: 'hexagon',
  error: 'triangle',
};

export function shapeOf(type: FlowType): PortShape {
  if (type.t === 'optional') return shapeOf(type.of);
  return SHAPE_BY_TYPE[type.t] ?? 'circle';
}

export function labelOf(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1).toLowerCase()}`;
}

export function pinsOf(kind: KindView): readonly ScenePort[] {
  return kind.outputs.map((output) => ({
    name: output.name,
    label: labelOf(output.name),
    shape: shapeOf(output.type),
    type: typeDisplayName(output.type),
    direction: 'out',
    value: null,
    wired: false,
    problem: false,
  }));
}

export function resolveSource(env: Env, reference: Reference): Source | null {
  const value = env.values.get(reference.key);
  if (value !== undefined) {
    return { nodeId: value.id, output: reference.output, valueKey: reference.key };
  }
  if (reference.key === 'inputs' && env.inputsId !== null) {
    return { nodeId: env.inputsId, output: reference.output, valueKey: null };
  }
  const entry = env.index.byKey.get(reference.key);
  return entry === undefined
    ? null
    : { nodeId: entry.node.id, output: reference.output, valueKey: null };
}

function outputType(env: Env, source: Source): string | null {
  const entry = env.index.byId.get(source.nodeId);
  if (entry === undefined) {
    const input = 'inputs' in env.program ? env.program.inputs : [];
    const found = input.find((port) => port.name === source.output);
    return found === undefined ? null : typeDisplayName(found.type);
  }
  const kind = kindView(env.options.registry, entry.node.kind);
  const found = kind.outputs.find((output) => output.name === source.output);
  return found === undefined ? null : typeDisplayName(found.type);
}

export function addEdge(env: Env, source: Source, to: EdgeEnd): void {
  const id = `value:${source.nodeId}.${source.output}>${to.nodeId}.${to.port}`;
  if (env.edgeIds.has(id) || source.nodeId === to.nodeId) return;
  env.edgeIds.add(id);
  env.edges.push({
    id,
    kind: 'value',
    from: { nodeId: source.nodeId, port: source.output },
    to,
    type: outputType(env, source),
  });
}

export function wireOne(env: Env, request: Request): readonly string[] {
  const claimedKeys: string[] = [];
  for (const reference of referencesOf(request.value, env.keys)) {
    const source = resolveSource(env, reference);
    if (source === null) continue;
    addEdge(env, source, request.to);
    const key = source.valueKey;
    if (key !== null && !env.claimed.has(key)) {
      env.claimed.add(key);
      claimedKeys.push(key);
    }
  }
  return claimedKeys;
}

function sourceText(env: Env, value: PortValue): string {
  const first = referencesOf(value, env.keys)[0];
  if (first === undefined) return valueWords(env, value);
  return `${env.titles.get(first.key) ?? first.key} › ${first.output}`;
}

export interface PortSubject {
  readonly name: string;
  readonly value: PortValue;
  readonly decl: KindView['inputs'][number] | undefined;
  readonly problems: readonly ProblemInput[];
}

export function describePort(env: Env, subject: PortSubject): ScenePort {
  const { name, value, decl, problems } = subject;
  const type = decl?.type ?? { t: 'any' as const };
  const wired = referencesOf(value, env.keys).length > 0;
  return {
    name,
    label: labelOf(name),
    shape: shapeOf(type),
    type: typeDisplayName(type),
    direction: 'in',
    value: portText(env, subject, wired),
    wired,
    problem: problems.some((problem) => problem.port === name),
  };
}

function portText(env: Env, subject: PortSubject, wired: boolean): string {
  if (wired) return sourceText(env, subject.value);
  return domainPortText(subject.value, subject.decl, env.describe.names, env.scope);
}
