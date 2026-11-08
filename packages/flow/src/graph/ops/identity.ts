import {
  TRIGGER_KIND_PREFIX,
  type GraphNode,
  type ProgramV4,
  type TriggerNode,
} from '@smarteverything/domain';
import { generateKey, keyAvailable } from '../../program/keys';
import type { OpEnv } from './result';
import { refuse } from './result';

export type Entry =
  | { readonly kind: 'node'; readonly node: GraphNode; readonly index: number }
  | { readonly kind: 'trigger'; readonly node: TriggerNode; readonly index: number };

export interface Taken {
  readonly keys: Set<string>;
  readonly ids: Set<string>;
}

export interface Ids {
  readonly taken: Taken;
  readonly env: OpEnv;
}

export function triggersOf(program: ProgramV4): TriggerNode[] {
  return program.kind === 'automation' ? program.triggers : [];
}

export function isTriggerKind(kind: string): boolean {
  return kind.startsWith(TRIGGER_KIND_PREFIX);
}

export function findEntry(program: ProgramV4, key: string): Entry | undefined {
  const node = program.nodes.findIndex((candidate) => candidate.key === key);
  const found = program.nodes[node];
  if (found !== undefined) return { kind: 'node', node: found, index: node };
  const trigger = triggersOf(program).findIndex((candidate) => candidate.key === key);
  const hit = triggersOf(program)[trigger];
  return hit === undefined ? undefined : { kind: 'trigger', node: hit, index: trigger };
}

export function entryOf(program: ProgramV4, key: string): Entry {
  return findEntry(program, key) ?? refuse('unknown_key', `there is no node or trigger "${key}"`);
}

export function nodeOf(program: ProgramV4, key: string): GraphNode {
  const entry = entryOf(program, key);
  if (entry.kind === 'trigger') refuse('not_allowed', `"${key}" is a trigger, not a node`);
  return entry.node;
}

export function takenOf(program: ProgramV4): Taken {
  const triggers = triggersOf(program);
  const rows = program.nodes.flatMap((node) => [
    ...(node.branches ?? []),
    ...(node.cases ?? []),
    ...(node.catches ?? []),
  ]);
  return {
    keys: new Set([...triggers, ...program.nodes].map((node) => node.key)),
    ids: new Set([...triggers, ...program.nodes, ...rows].map((item) => item.id)),
  };
}

export function claimKey(taken: Taken, requested: string | undefined, kind: string): string {
  if (requested === undefined) {
    const generated = generateKey(kind, taken.keys);
    taken.keys.add(generated);
    return generated;
  }
  const problem = keyAvailable(requested, taken.keys);
  if (problem !== undefined) refuse('key_taken', problem);
  taken.keys.add(requested);
  return requested;
}

export function claimId(taken: Taken, requested: string | undefined, env: OpEnv): string {
  let id = requested ?? env.newId();
  if (requested !== undefined && taken.ids.has(id)) {
    refuse('id_taken', `the id ${id} is already used`);
  }
  while (taken.ids.has(id)) id = env.newId();
  taken.ids.add(id);
  return id;
}
