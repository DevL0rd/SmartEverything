import type { NodeKindLookup } from '@smarteverything/domain';
import { execClassOf, type ProgramV4 } from '@smarteverything/domain';
import type { StructuredOf } from '@smarteverything/flow/graph/structured-of';
import { indexProgram } from '@smarteverything/flow/program/lookup';

interface Pending {
  readonly fork: string;
  readonly join: string;
}

function walkedIds(outcome: StructuredOf, joins: ReadonlyMap<string, string>): readonly string[] {
  if (outcome.kind !== 'structured') return [];
  const order: string[] = [];
  const pending: Pending[] = [];
  const flush = (ancestors: readonly string[]): void => {
    for (
      let top = pending[pending.length - 1];
      top !== undefined;
      top = pending[pending.length - 1]
    ) {
      if (ancestors.includes(top.fork)) return;
      order.push(top.join);
      pending.pop();
    }
  };
  for (const entry of indexProgram(outcome.tree).nodes) {
    flush(entry.ancestors);
    order.push(entry.node.id);
    const join = joins.get(entry.node.key);
    if (join !== undefined) pending.push({ fork: entry.node.key, join });
  }
  flush([]);
  return order;
}

export function sceneOrder(
  program: ProgramV4,
  outcome: StructuredOf,
  joinOf: ReadonlyMap<string, string>,
  kinds: NodeKindLookup,
): readonly string[] {
  const idByKey = new Map(program.nodes.map((node) => [node.key, node.id]));
  const joins = new Map(
    [...joinOf].flatMap(([fork, join]): (readonly [string, string])[] => {
      const id = idByKey.get(join);
      return id === undefined ? [] : [[fork, id]];
    }),
  );
  const idsOf = (execClass: string): readonly string[] =>
    program.nodes
      .filter((node) => execClassOf(node.kind, kinds) === execClass)
      .map((node) => node.id);
  const triggers = program.kind === 'automation' ? program.triggers : [];
  return [
    ...new Set([
      ...triggers.map((trigger) => trigger.id),
      ...idsOf('start'),
      ...walkedIds(outcome, joins),
      ...idsOf('failure'),
      ...program.nodes.map((node) => node.id),
    ]),
  ];
}
