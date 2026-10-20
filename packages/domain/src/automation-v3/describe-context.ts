import type { NodeKind } from '../automation-nodes/define';
import { humanizeKey } from '../presentation/humanize';
import type { RefKind } from './types';

export type DescribeKind = Pick<
  NodeKind,
  'id' | 'name' | 'summary' | 'keywords' | 'inputs' | 'outputs' | 'class'
>;

export type KindLookup = (id: string) => DescribeKind | undefined;

export type RefNames = (kind: RefKind, id: string) => string | undefined;

export interface DescribeContext {
  readonly kinds: KindLookup;
  readonly names: RefNames;
}

export interface Labelled {
  readonly kind: string;
  readonly label?: string | undefined;
}

export const REFERENCE_SEPARATOR = ' › ';

function lastWord(kindId: string): string {
  return humanizeKey(kindId.slice(kindId.lastIndexOf('.') + 1));
}

export function nodeLabel(node: Labelled, kinds: KindLookup): string {
  return node.label ?? kinds(node.kind)?.name ?? lastWord(node.kind);
}

export function outputLabel(name: string): string {
  return humanizeKey(name);
}

export function referenceLabel(step: string, output: string): string {
  return `${step}${REFERENCE_SEPARATOR}${output}`;
}

export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
