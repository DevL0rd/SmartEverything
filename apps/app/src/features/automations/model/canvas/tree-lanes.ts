import type { FlowNode, PortValue, SwitchMatch } from '@smarteverything/domain';
import type { ChildPart } from '@smarteverything/flow/program/paths';
import { formatChildPart } from '@smarteverything/flow/program/paths';
import type { ScopeRef } from '@smarteverything/flow/program/walk';
import { childScopeRefs } from '@smarteverything/flow/program/walk';
import type { KindView } from './tree-env';

export interface LaneSpec {
  readonly id: string;
  readonly ref: ScopeRef;
  readonly title: string;
  readonly chip: string | null;
  readonly pills: readonly string[];
  readonly pins: readonly string[];
  readonly loopLabel: string | null;
}

const NAMED_TITLES: Readonly<Record<string, string>> = {
  else: 'Otherwise',
  default: 'Default',
  finally: 'Finally',
  try: 'Try',
};

const NAMED_RANK: Readonly<Record<string, number>> = { try: 0, else: 3, default: 3, finally: 4 };

function capitalised(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function rank(part: ChildPart): number {
  if (part.kind === 'catch') return 2;
  if (part.kind === 'scope') return NAMED_RANK[part.name] ?? 1;
  return 1;
}

export type Words = (value: PortValue) => string;

function matchPhrase(match: SwitchMatch, words: Words): { title: string; chip: string } {
  if ('eq' in match) return { title: `Equals ${JSON.stringify(match.eq)}`, chip: 'Equals' };
  if ('in' in match) return { title: `One of ${String(match.in.length)}`, chip: 'One of' };
  if ('range' in match) {
    const { min, max } = match.range;
    if (max === undefined) return { title: `At least ${String(min)}`, chip: 'Between' };
    if (min === undefined) return { title: `At most ${String(max)}`, chip: 'Between' };
    return { title: `Between ${String(min)} and ${String(max)}`, chip: 'Between' };
  }
  return { title: `When ${words(match.when)}`, chip: 'Condition' };
}

function bodyTitle(kind: KindView): string {
  return kind.id === 'flow.for_each' ? 'For each item' : 'Repeat';
}

function branchText(node: FlowNode, id: string, words: Words): LaneText {
  const row = (node.branches ?? []).findIndex((branch) => branch.id === id);
  const branch = node.branches?.[row];
  const text = branch === undefined ? '' : words(branch.when);
  return { title: `${row === 0 ? 'If' : 'Else if'} ${text}`, chip: 'Condition' };
}

function caseText(node: FlowNode, id: string, words: Words): LaneText {
  const found = (node.cases ?? []).find((row) => row.id === id);
  const phrase =
    found === undefined ? { title: 'Case', chip: 'Condition' } : matchPhrase(found.match, words);
  return { title: `Case ${phrase.title}`, chip: phrase.chip };
}

function catchText(node: FlowNode, id: string): LaneText {
  const found = (node.catches ?? []).find((row) => row.id === id);
  const classes = found?.classes?.join(', ') ?? 'any failure';
  return { title: `Catch ${classes}`, chip: classes };
}

function namedText(kind: KindView, name: string, order: number): LaneText {
  if (name === 'body') return { title: bodyTitle(kind), chip: null };
  const parallel = kind.id === 'flow.parallel' ? `Branch ${String(order + 1)}` : null;
  return { title: NAMED_TITLES[name] ?? parallel ?? capitalised(name), chip: null };
}

interface LaneSource {
  readonly node: FlowNode;
  readonly kind: KindView;
  readonly words: Words;
}

function titleOfPart({ node, kind, words }: LaneSource, part: ChildPart, order: number): LaneText {
  switch (part.kind) {
    case 'branch':
      return branchText(node, part.id, words);
    case 'case':
      return caseText(node, part.id, words);
    case 'catch':
      return catchText(node, part.id);
    case 'scope':
      return namedText(kind, part.name, order);
  }
}

interface LaneText {
  readonly title: string;
  readonly chip: string | null;
}

function pinsFor(node: FlowNode, part: ChildPart): readonly string[] {
  const names = new Set<string>(['id' in part ? part.id : part.name]);
  return (node.outputs ?? [])
    .filter((output) => Object.keys(output.values).some((key) => names.has(key)))
    .map((output) => output.name);
}

export function laneIdOf(nodeId: string, part: ChildPart): string {
  return `${nodeId}:${formatChildPart(part)}`;
}

export function isLoop(kind: KindView): boolean {
  return kind.scopes?.required.includes('body') === true;
}

function loopLabelFor(kind: KindView, part: ChildPart): string | null {
  if (!isLoop(kind) || part.kind !== 'scope' || part.name !== 'body') return null;
  return kind.id === 'flow.for_each' ? 'next item' : 'again';
}

interface Part {
  readonly ref: ScopeRef;
  readonly part: ChildPart;
  readonly order: number;
}

function partsOf(refs: readonly ScopeRef[]): readonly Part[] {
  return refs.flatMap((ref, order) =>
    ref.path.t === 'child' ? [{ ref, part: ref.path.part, order }] : [],
  );
}

export function laneSpecs(
  node: FlowNode,
  kind: KindView,
  storage: readonly (string | number)[],
  words: Words,
): readonly LaneSpec[] {
  const pills = kind.outputs.map((output) => output.name);
  return [...partsOf(childScopeRefs(node, storage))]
    .sort((a, b) => rank(a.part) - rank(b.part) || a.order - b.order)
    .map((entry) => specOf({ node, kind, words }, entry, pills));
}

function specOf(source: LaneSource, entry: Part, pills: readonly string[]): LaneSpec {
  const { node, kind } = source;
  const text = titleOfPart(source, entry.part, entry.order);
  return {
    id: laneIdOf(node.id, entry.part),
    ref: entry.ref,
    title: text.title,
    chip: text.chip,
    pills,
    pins: pinsFor(node, entry.part),
    loopLabel: loopLabelFor(kind, entry.part),
  };
}
