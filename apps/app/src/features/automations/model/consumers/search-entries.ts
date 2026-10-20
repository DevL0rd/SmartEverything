import {
  searchTitles,
  triggerKeywords,
  type KindLookup,
  type ProgramV3,
} from '@smarteverything/domain';
import type { ConsumerRow } from './row';

export const FLOWCHART_KEYWORDS: readonly string[] = [
  'flowchart',
  'flow',
  'diagram',
  'graph',
  'visual',
  'nodes',
  'boxes',
  'arrows',
];

export interface RoutineEntry {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly triggerKeywords: readonly string[];
  readonly path: string;
}

export interface NodeFocusTarget {
  readonly key: string;
  readonly parent: string | null;
  readonly title: string;
  readonly focus: string;
  readonly keywords: readonly string[];
}

export function routineEntryOf(row: ConsumerRow, kinds: KindLookup): RoutineEntry {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    triggerKeywords: triggerKeywords(row.definition.triggers, kinds),
    path: '',
  };
}

export function focusTargetsOf(program: ProgramV3, kinds: KindLookup): readonly NodeFocusTarget[] {
  const inputs = program.inputs.map((input) => ({
    key: `input:${input.name}`,
    parent: null,
    title: input.label ?? input.name,
    focus: `input:${input.name}`,
    keywords: ['input', 'argument', input.type.t],
  }));
  const nodes = searchTitles(program, kinds).map((entry) => ({
    key: `node:${entry.nodeId}`,
    parent: null,
    title: entry.title,
    focus: `node:${entry.nodeId}`,
    keywords: ['step', 'action', ...entry.keywords],
  }));
  return [...inputs, ...nodes];
}
