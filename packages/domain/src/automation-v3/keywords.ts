import { nodeLabel, type KindLookup } from './describe-context';
import { programNodes } from './describe';
import type { TriggerNode } from './node';
import type { ProgramV3 } from './program';
import { signalViewOf } from './signal-view';

export interface SearchTitle {
  readonly nodeId: string;
  readonly key: string;
  readonly title: string;
  readonly keywords: readonly string[];
}

function matchWords(match: SignalMatchValues | undefined): readonly string[] {
  return Object.values(match ?? {}).filter((value) => typeof value === 'string');
}

type SignalMatchValues = Readonly<Record<string, unknown>>;

function triggerWords(trigger: TriggerNode, kinds: KindLookup): readonly string[] {
  const kind = kinds(trigger.kind);
  const view = signalViewOf(trigger);
  return [
    ...(kind === undefined ? [] : [kind.name, ...kind.keywords]),
    ...(view === undefined
      ? []
      : [view.source, view.kind, ...(view.field === undefined ? [] : [view.field])]),
    ...(view === undefined ? [] : matchWords(view.match)),
  ];
}

export function triggerKeywords(
  triggers: readonly TriggerNode[],
  kinds: KindLookup,
): readonly string[] {
  return [...new Set(triggers.flatMap((trigger) => triggerWords(trigger, kinds)))];
}

export function searchTitles(program: ProgramV3, kinds: KindLookup): readonly SearchTitle[] {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  return [...triggers, ...programNodes(program)].map((node) => ({
    nodeId: node.id,
    key: node.key,
    title: nodeLabel(node, kinds),
    keywords: kinds(node.kind)?.keywords ?? [],
  }));
}

export function programKeywords(program: ProgramV3, kinds: KindLookup): readonly string[] {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  const stepWords = programNodes(program).flatMap((node) => kinds(node.kind)?.keywords ?? []);
  return [...new Set([...triggerKeywords(triggers, kinds), ...stepWords])];
}
