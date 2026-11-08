import type { GraphNode, TriggerNode } from '@smarteverything/domain';
import { claimId, claimKey, type Taken } from './identity';
import type { OpEnv } from './result';
import { refuse } from './result';
import type { NodeInput } from './schema';
import { compact } from './util';

export function fillNode(input: NodeInput, taken: Taken, env: OpEnv): GraphNode {
  const key = claimKey(taken, input.key, input.kind);
  const id = claimId(taken, input.id, env);
  return compact({
    id,
    key,
    kind: input.kind,
    ports: input.ports,
    to: input.to,
    branches: input.branches?.map((row) => compact({ ...row, id: claimId(taken, row.id, env) })),
    cases: input.cases?.map((row) => compact({ ...row, id: claimId(taken, row.id, env) })),
    catches: input.catches?.map((row) => compact({ ...row, id: claimId(taken, row.id, env) })),
    paths: input.paths?.map((row) => compact({ ...row })),
    outputs: input.outputs,
    policy: input.policy,
    label: input.label,
    note: input.note,
    enabled: input.enabled,
    pin: input.pin,
  });
}

const NODE_ONLY: readonly (keyof NodeInput)[] = [
  'to',
  'branches',
  'cases',
  'catches',
  'paths',
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
