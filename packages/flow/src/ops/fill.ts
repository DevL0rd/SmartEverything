import type {
  Branch,
  CatchRow,
  FlowNode,
  Scope,
  SwitchCase,
  TriggerNode,
} from '@smarteverything/domain';
import { keyAvailable, generateKey, usedKeys } from '../program/keys';
import type { Program } from '../program/walk';
import { walkProgram } from '../program/walk';
import type { BranchInput, CaseInput, CatchInput, NodeInput, ScopeInput } from './schema';
import type { OpEnv } from './result';
import { refuse } from './result';
import { compact } from './util';

export interface Taken {
  readonly keys: Set<string>;
  readonly ids: Set<string>;
}

export function takenOf(program: Program): Taken {
  const ids = new Set<string>(
    program.kind === 'automation' ? program.triggers.map((t) => t.id) : [],
  );
  for (const { node } of walkProgram(program)) {
    ids.add(node.id);
    for (const row of [...(node.branches ?? []), ...(node.cases ?? []), ...(node.catches ?? [])]) {
      ids.add(row.id);
    }
  }
  return { keys: new Set(usedKeys(program)), ids };
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
  if (requested !== undefined && taken.ids.has(id))
    refuse('id_taken', `the id ${id} is already used`);
  while (taken.ids.has(id)) id = env.newId();
  taken.ids.add(id);
  return id;
}

function fillScope(input: ScopeInput, taken: Taken, env: OpEnv): Scope {
  return { nodes: input.nodes.map((node) => fillNode(node, taken, env)) };
}

export function fillBranch(input: BranchInput, taken: Taken, env: OpEnv): Branch {
  const id = claimId(taken, input.id, env);
  return { id, when: input.when, scope: fillScope(input.scope, taken, env) };
}

export function fillCase(input: CaseInput, taken: Taken, env: OpEnv): SwitchCase {
  const id = claimId(taken, input.id, env);
  return { id, match: input.match, scope: fillScope(input.scope, taken, env) };
}

export function fillCatch(input: CatchInput, taken: Taken, env: OpEnv): CatchRow {
  const id = claimId(taken, input.id, env);
  return compact({ id, classes: input.classes, scope: fillScope(input.scope, taken, env) });
}

function fillScopes(
  scopes: Readonly<Record<string, ScopeInput>>,
  taken: Taken,
  env: OpEnv,
): Record<string, Scope> {
  return Object.fromEntries(
    Object.entries(scopes).map(([name, scope]) => [name, fillScope(scope, taken, env)]),
  );
}

export function fillNode(input: NodeInput, taken: Taken, env: OpEnv): FlowNode {
  const key = claimKey(taken, input.key, input.kind);
  const id = claimId(taken, input.id, env);
  return compact({
    id,
    key,
    kind: input.kind,
    ports: input.ports,
    branches: input.branches?.map((row) => fillBranch(row, taken, env)),
    cases: input.cases?.map((row) => fillCase(row, taken, env)),
    catches: input.catches?.map((row) => fillCatch(row, taken, env)),
    scopes: input.scopes && fillScopes(input.scopes, taken, env),
    outputs: input.outputs,
    policy: input.policy,
    label: input.label,
    note: input.note,
    enabled: input.enabled,
    pin: input.pin,
  });
}

const NODE_ONLY: readonly (keyof NodeInput)[] = [
  'branches',
  'cases',
  'catches',
  'scopes',
  'outputs',
  'policy',
  'pin',
];

export function fillTrigger(input: NodeInput, taken: Taken, env: OpEnv): TriggerNode {
  if (NODE_ONLY.some((field) => input[field] !== undefined)) {
    refuse('not_allowed', 'a trigger has ports, a label, a note and enabled only');
  }
  const key = claimKey(taken, input.key, input.kind);
  const id = claimId(taken, input.id, env);
  return compact({
    id,
    key,
    kind: input.kind,
    ports: input.ports ?? {},
    label: input.label,
    note: input.note,
    enabled: input.enabled,
  });
}
