import {
  execClassOf,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
  type TriggerNode,
} from '@smarteverything/domain';
import { joinOfFork } from '@smarteverything/flow/graph/ops/wires';
import { holderById, triggersOf } from './intent-env';

export interface Picked {
  readonly nodes: readonly GraphNode[];
  readonly triggers: readonly TriggerNode[];
  readonly joins: Readonly<Record<string, string>>;
}

export function pickedOf(
  program: ProgramV4,
  ids: readonly string[],
  kinds: NodeKindLookup,
): Picked {
  const holders = ids.flatMap((id) => {
    const holder = holderById(program, id);
    return holder === undefined ? [] : [holder];
  });
  const keys = new Set(holders.map((holder) => holder.key));
  const joinEntries = [...keys].flatMap((key) => {
    const join = joinOfFork(program, key, kinds);
    return join === undefined ? [] : [[key, join] as const];
  });
  const owned = new Set(joinEntries.map(([, join]) => join));
  const nodes = program.nodes.filter((node) => {
    const execClass = execClassOf(node.kind, kinds);
    if (execClass === 'start' || execClass === 'failure') return false;
    return execClass === 'join' ? owned.has(node.key) : keys.has(node.key);
  });
  return {
    nodes,
    triggers: triggersOf(program).filter((trigger) => keys.has(trigger.key)),
    joins: Object.fromEntries(joinEntries),
  };
}
