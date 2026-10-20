import type { FlowNode } from '@smarteverything/domain';
import { TRIGGER_KIND_PREFIX } from '@smarteverything/domain';
import type { Program } from '../program/walk';
import { fillNode, fillTrigger, takenOf } from './fill';
import { guardFreeKeys } from './guard';
import type { OpEnv, Outcome } from './result';
import { outcome, refuse } from './result';
import type { AddOp } from './schema';
import { insertionIndex, resolveTarget } from './target';
import { subtreeKeys } from './util';

function created(node: FlowNode): Outcome['created'] {
  return [{ key: node.key, id: node.id }];
}

export function applyAdd(program: Program, op: AddOp, env: OpEnv): Outcome {
  const next = structuredClone(program);
  const taken = takenOf(next);
  const target = resolveTarget(next, op.in);
  const isTrigger = op.node.kind.startsWith(TRIGGER_KIND_PREFIX);
  if (isTrigger !== (target.t === 'triggers')) {
    refuse('not_allowed', 'a trigger kind goes into "triggers" and every other kind into a scope');
  }
  if (target.t === 'triggers') {
    const trigger = fillTrigger(op.node, taken, env);
    guardFreeKeys(next, [trigger.key]);
    target.list.splice(insertionIndex(target.list, op), 0, trigger);
    return outcome(next, [{ op: 'remove', key: trigger.key }], { created: created(trigger) });
  }
  const node = fillNode(op.node, taken, env);
  guardFreeKeys(next, [node.key, ...subtreeKeys(node)]);
  target.list.splice(insertionIndex(target.list, op), 0, node);
  return outcome(next, [{ op: 'remove', key: node.key }], { created: created(node) });
}
