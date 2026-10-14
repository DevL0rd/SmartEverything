import type { AiMessageReference, AiReferenceSummary } from '@smarteverything/domain';
import { adjustedReferences, type ReferenceText } from './spans';
export interface ComposerSelection {
  readonly start: number;
  readonly end: number;
}
export interface ReferenceIntent {
  readonly start: number;
  readonly end: number;
  readonly query: string;
}
const QUERY_MAX = 200;
export function referenceIntent(
  text: string,
  selection: ComposerSelection,
): ReferenceIntent | null {
  if (selection.start !== selection.end || selection.end > text.length) return null;
  const prefix = text.slice(0, selection.start);
  const match = /(?:^|\s)@([^@\n]{0,200})$/u.exec(prefix);
  if (match === null) return null;
  const query = match[1];
  if (query === undefined || query.length > QUERY_MAX) return null;
  const start = prefix.length - query.length - 1;
  return { start, end: selection.start, query };
}
export function selectedReference(
  input: ReferenceText,
  intent: ReferenceIntent,
  item: AiReferenceSummary,
): ReferenceText & { readonly selection: ComposerSelection } {
  const token = `@${item.label}`;
  const suffix = input.text.slice(intent.end);
  const space = suffix === '' || !/^\s/u.test(suffix) ? ' ' : '';
  const text = input.text.slice(0, intent.start) + token + space + suffix;
  const reference: AiMessageReference = {
    reference: item.reference,
    label: item.label,
    token,
    start: intent.start,
    end: intent.start + token.length,
  };
  return {
    text,
    references: [...adjustedReferences(input.text, text, input.references), reference].sort(
      (left, right) => left.start - right.start,
    ),
    selection: { start: reference.end + space.length, end: reference.end + space.length },
  };
}
export function removedReference(input: ReferenceText, item: AiMessageReference): ReferenceText {
  const text = input.text.slice(0, item.start) + input.text.slice(item.end);
  return { text, references: adjustedReferences(input.text, text, input.references) };
}

export function requestsReferences(text: string): boolean {
  return /(?:^|\s)@/u.test(text);
}
