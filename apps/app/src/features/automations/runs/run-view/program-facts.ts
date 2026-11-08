import { STATEFUL_KIND_IDS } from '@smarteverything/domain';
import type { PortValue } from '@smarteverything/domain';
import { walkProgram, type Program } from '@smarteverything/flow/program/walk';
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

const FUNCTION_CALL_KIND = 'fn.call';

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

interface Titled {
  readonly kind: string;
  readonly label?: string | undefined;
  readonly ports?: Readonly<Record<string, PortValue>> | undefined;
}

function calledName(node: Titled, options: SceneOptions): string | undefined {
  const fn = node.ports?.['fn'];
  const id = fn !== undefined && 'lit' in fn && typeof fn.lit === 'string' ? fn.lit : null;
  return id === null ? undefined : options.functions.get(id)?.name;
}

function titleOf(options: SceneOptions, node: Titled): string {
  if (node.label !== undefined) return node.label;
  const called = node.kind === FUNCTION_CALL_KIND ? calledName(node, options) : undefined;
  return called ?? options.registry.get(node.kind)?.name ?? 'Unknown step';
}

export function programFacts(program: Program, options: SceneOptions): ProgramFacts {
  const nodes = walkProgram(program).map(({ node }) => node);
  const triggers = 'triggers' in program ? program.triggers : [];
  const titles = new Map<string, string>(
    [...triggers, ...nodes].map((node) => [node.id, titleOf(options, node)]),
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
