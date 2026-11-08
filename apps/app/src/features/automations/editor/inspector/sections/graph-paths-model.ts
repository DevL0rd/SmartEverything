import {
  SCOPE_NAME,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { forkOfJoin, joinOfFork } from '@smarteverything/flow/graph/ops/wires';
import { nodeName } from '@smarteverything/flow/graph/problem-types';

export const FORK_KIND = 'flow.parallel';
export const JOIN_KIND = 'flow.join';

const RESERVED_PATH = 'onError';

export interface PathRow {
  readonly name: string;
  readonly text: string;
  readonly straightToJoin: boolean;
}

export interface PathsModel {
  readonly rows: readonly PathRow[];
  readonly joinName: string | undefined;
  readonly minimum: number;
  readonly canRemove: boolean;
}

export interface OptionChoice {
  readonly value: string;
  readonly label: string;
}

export interface JoinOptions {
  readonly forkKey: string;
  readonly forkName: string;
  readonly title: string;
  readonly join: string | undefined;
  readonly errors: string | undefined;
  readonly joinChoices: readonly OptionChoice[];
  readonly errorChoices: readonly OptionChoice[];
  readonly recordsEach: boolean;
}

export const STATUS_NOTE = 'Gives a status value that tells how each path ended.';

function choicesOf(port: string, kinds: NodeKindLookup): readonly OptionChoice[] {
  const type = kinds.get(FORK_KIND)?.inputs.find((input) => input.name === port)?.type;
  return type?.t === 'choice'
    ? type.options.map((option) => ({ value: option.id, label: option.label }))
    : [];
}

function defaultOf(port: string, kinds: NodeKindLookup): string | undefined {
  const value = kinds.get(FORK_KIND)?.inputs.find((input) => input.name === port)?.default;
  return typeof value === 'string' ? value : undefined;
}

function optionOf(fork: GraphNode, port: string, kinds: NodeKindLookup): string | undefined {
  const value = fork.ports?.[port];
  if (value === undefined) return defaultOf(port, kinds);
  return 'lit' in value && typeof value.lit === 'string' ? value.lit : undefined;
}

function pathText(
  to: string | undefined,
  byKey: ReadonlyMap<string, GraphNode>,
  join: GraphNode | undefined,
  kinds: NodeKindLookup,
): string {
  if (to === undefined) return 'Ends the path';
  if (to === join?.key) return `Goes straight to ${nodeName(join, kinds)}`;
  const target = byKey.get(to);
  return target === undefined ? `Missing step "${to}"` : `Starts with ${nodeName(target, kinds)}`;
}

export function pathsOf(
  program: ProgramV4,
  node: GraphNode,
  kinds: NodeKindLookup,
): PathsModel | undefined {
  if (node.kind !== FORK_KIND) return undefined;
  const byKey = new Map(program.nodes.map((item) => [item.key, item]));
  const joinKey = joinOfFork(program, node.key, kinds);
  const join = joinKey === undefined ? undefined : byKey.get(joinKey);
  const paths = node.paths ?? [];
  const minimum = kinds.get(FORK_KIND)?.scopes?.minimum ?? 0;
  return {
    rows: paths.map((path) => ({
      name: path.name,
      text: pathText(path.to, byKey, join, kinds),
      straightToJoin: join !== undefined && path.to === join.key,
    })),
    joinName: join === undefined ? undefined : nodeName(join, kinds),
    minimum,
    canRemove: paths.length > minimum,
  };
}

export function nextPathName(names: readonly string[]): string {
  let number = names.length + 1;
  while (names.includes(`path${String(number)}`)) number += 1;
  return `path${String(number)}`;
}

export function pathNameProblem(
  names: readonly string[],
  from: string | undefined,
  text: string,
): string | undefined {
  if (text === from) return undefined;
  if (!SCOPE_NAME.safeParse(text).success) {
    return 'Use letters and numbers, starting with a lowercase letter.';
  }
  if (text === RESERVED_PATH) return 'That name is kept for the failure lane.';
  return names.includes(text) ? 'A path with that name exists.' : undefined;
}

export function addPathOps(key: string, name: string): readonly PatchOp[] {
  return [{ op: 'path', key, edit: { t: 'add', name } }];
}

export function renamePathOps(key: string, name: string, as: string): readonly PatchOp[] {
  return [{ op: 'path', key, edit: { t: 'rename', name, as } }];
}

export function removePathOps(key: string, name: string): readonly PatchOp[] {
  return [{ op: 'path', key, edit: { t: 'remove', name } }];
}

export function forkOf(
  program: ProgramV4,
  node: GraphNode,
  kinds: NodeKindLookup,
): GraphNode | undefined {
  if (node.kind === FORK_KIND) return node;
  if (node.kind !== JOIN_KIND) return undefined;
  const key = forkOfJoin(program, node.key, kinds);
  return program.nodes.find((item) => item.key === key);
}

export function joinOptionsOf(
  program: ProgramV4,
  node: GraphNode,
  kinds: NodeKindLookup,
): JoinOptions | undefined {
  const fork = forkOf(program, node, kinds);
  if (fork === undefined) return undefined;
  const join = optionOf(fork, 'join', kinds);
  const joinChoices = choicesOf('join', kinds);
  return {
    forkKey: fork.key,
    forkName: nodeName(fork, kinds),
    title: joinChoices.find((choice) => choice.value === join)?.label ?? 'Wait for all',
    join,
    errors: optionOf(fork, 'errors', kinds),
    joinChoices,
    errorChoices: choicesOf('errors', kinds),
    recordsEach: join === 'settled',
  };
}

export function joinOptionOps(
  forkKey: string,
  port: 'join' | 'errors',
  id: string,
): readonly PatchOp[] {
  return [{ op: 'set', key: forkKey, ports: { [port]: { lit: id } } }];
}
