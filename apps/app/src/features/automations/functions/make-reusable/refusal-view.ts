import { STATEFUL_KIND_IDS } from '@smarteverything/domain';
import type { ExtractCode, Refusal } from '@smarteverything/flow/extract/result';
import {
  indexProgram,
  type NodeEntry,
  type ProgramIndex,
} from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { TitleOf } from './plain-reference';

export interface Suggestion {
  readonly label: string;
  readonly keys: readonly string[];
}

export interface RefusalView {
  readonly message: string;
  readonly suggestion: Suggestion | null;
}

const LOOP_KINDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
  'flow.forever',
]);

const LEAVES_LOOP_KINDS: ReadonlySet<string> = new Set(['flow.break', 'flow.continue']);

const FIXED_MESSAGES: Readonly<Partial<Record<ExtractCode, string>>> = {
  empty: 'Select the steps you want to turn into a Custom Node.',
  trigger: 'Triggers stay in the automation. Only steps can become a Custom Node.',
  persistent:
    'Persistent variables stay in the automation. Pass their value into the node instead.',
  scattered: 'The selected steps are not next to each other.',
  dynamic: 'A selected step picks its variable or loop with a wire. Choose it directly first.',
  control:
    'A selected step jumps out of the selection (Stop loop, Next round, Guard or Return). Select the whole loop, or end the selection where the scope ends.',
};

function nodes(count: number): string {
  return count === 1 ? '1 node' : `${String(count)} nodes`;
}

function withDescendants(index: ProgramIndex, keys: readonly string[]): readonly NodeEntry[] {
  const picked = new Set(keys);
  return index.nodes.filter(
    (entry) => picked.has(entry.node.key) || entry.ancestors.some((key) => picked.has(key)),
  );
}

function rangeSuggestion(keys: readonly string[], titleOf: TitleOf): Suggestion | null {
  const first = keys[0];
  const last = keys.at(-1);
  if (first === undefined || last === undefined) return null;
  return {
    label: `Select ${nodes(keys.length)} from ${titleOf(first)} to ${titleOf(last)}`,
    keys,
  };
}

function withoutTriggers(index: ProgramIndex, keys: readonly string[]): Suggestion | null {
  const kept = keys.filter((key) => index.byKey.get(key)?.kind === 'node');
  return kept.length === 0 || kept.length === keys.length
    ? null
    : { label: 'Leave out the trigger', keys: kept };
}

function statefulView(
  index: ProgramIndex,
  keys: readonly string[],
  titleOf: TitleOf,
): RefusalView | null {
  const stateful = withDescendants(index, keys).filter((entry) =>
    STATEFUL_KIND_IDS.has(entry.node.kind),
  );
  if (stateful.length === 0) return null;
  const names = [...new Set(stateful.map((entry) => titleOf(entry.node.key)))];
  const direct = new Set(stateful.map((entry) => entry.node.key));
  const rest = keys.filter((key) => !direct.has(key));
  const leaveOut = stateful.every((entry) => keys.includes(entry.node.key)) && rest.length > 0;
  return {
    message: `${names.join(', ')} remembers things between runs, so it has to stay in the automation.`,
    suggestion: leaveOut ? { label: `Leave out ${names.join(', ')}`, keys: rest } : null,
  };
}

function loopSuggestion(
  index: ProgramIndex,
  keys: readonly string[],
  titleOf: TitleOf,
): Suggestion | null {
  const picked = new Set(withDescendants(index, keys).map((entry) => entry.node.key));
  const leavers = withDescendants(index, keys).filter((entry) =>
    LEAVES_LOOP_KINDS.has(entry.node.kind),
  );
  const loops = leavers.flatMap((entry) => {
    const loop = entry.ancestors.findLast((key) => {
      const found = index.byKey.get(key);
      return found?.kind === 'node' && LOOP_KINDS.has(found.node.kind) && !picked.has(key);
    });
    return loop === undefined ? [] : [loop];
  });
  const [loop] = loops;
  return loop === undefined
    ? null
    : { label: `Include the loop ${titleOf(loop)}`, keys: [...keys, loop] };
}

function sentence(text: string): string {
  const trimmed = text.trim();
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function refusalView(
  refusal: Refusal,
  program: Program,
  keys: readonly string[],
  titleOf: TitleOf,
): RefusalView {
  const index = indexProgram(program);
  if (refusal.code === 'stateful') {
    const view = statefulView(index, keys, titleOf);
    if (view !== null) return view;
  }
  const message = FIXED_MESSAGES[refusal.code] ?? `${sentence(refusal.reason)}.`;
  if (refusal.code === 'scattered') {
    return { message, suggestion: rangeSuggestion(refusal.suggestion, titleOf) };
  }
  if (refusal.code === 'trigger') return { message, suggestion: withoutTriggers(index, keys) };
  if (refusal.code === 'control')
    return { message, suggestion: loopSuggestion(index, keys, titleOf) };
  return { message, suggestion: null };
}
