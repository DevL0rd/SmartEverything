import { STATEFUL_KIND_IDS } from '@smarteverything/domain';
import type { Layout } from '@smarteverything/domain';
import { walkProgram, type Program } from '@smarteverything/flow/program/walk';
import { titleOf } from '../../model/canvas/tree-env';
import type { SceneOptions } from '../../editor/host/use-canvas-props';

export interface ProgramFacts {
  readonly titles: ReadonlyMap<string, string>;
  readonly itemNames: ReadonlyMap<string, string>;
  readonly stateful: ReadonlySet<string>;
}

export const EMPTY_FACTS: ProgramFacts = {
  titles: new Map(),
  itemNames: new Map(),
  stateful: new Set(),
};

const LISTED_ITEM = 'Item';
const REPEATED_ITEM = 'Time';

const LOOP_ITEM: ReadonlyMap<string, string> = new Map([
  ['flow.for_each', LISTED_ITEM],
  ['flow.repeat', REPEATED_ITEM],
  ['flow.for_range', REPEATED_ITEM],
  ['flow.while', REPEATED_ITEM],
  ['flow.do_until', REPEATED_ITEM],
  ['flow.forever', REPEATED_ITEM],
]);

export function programFacts(
  program: Program,
  layout: Layout,
  options: SceneOptions,
): ProgramFacts {
  const full = { ...options, layout };
  const nodes = walkProgram(program).map(({ node }) => node);
  const triggers = 'triggers' in program ? program.triggers : [];
  const titles = new Map<string, string>(
    [...triggers, ...nodes].map((node) => [node.id, titleOf(full, node)]),
  );
  const itemNames = new Map<string, string>();
  const stateful = new Set<string>();
  for (const node of nodes) {
    const item = LOOP_ITEM.get(node.kind);
    if (item !== undefined) itemNames.set(node.id, item);
    if (STATEFUL_KIND_IDS.has(node.kind)) stateful.add(node.id);
  }
  return { titles, itemNames, stateful };
}
