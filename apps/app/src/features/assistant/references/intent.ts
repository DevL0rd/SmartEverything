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
export function referenceInsertion(
  before: string,
  intent: ReferenceIntent,
  label: string,
): {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly token: string;
  readonly selection: ComposerSelection;
} {
  const token = `@${label}`;
  const suffix = before.slice(intent.end);
  const space = suffix === '' || !/^\s/u.test(suffix) ? ' ' : '';
  const text = before.slice(0, intent.start) + token + space + suffix;
  const end = intent.start + token.length;
  return {
    text,
    start: intent.start,
    end,
    token,
    selection: { start: end + space.length, end: end + space.length },
  };
}
export function selectedReference(
  input: ReferenceText,
  intent: ReferenceIntent,
  item: AiReferenceSummary,
): ReferenceText & { readonly selection: ComposerSelection } {
  const { text, start, end, token, selection } = referenceInsertion(input.text, intent, item.label);
  const reference: AiMessageReference = {
    reference: item.reference,
    label: item.label,
    token,
    start,
    end,
  };
  return {
    text,
    references: [...adjustedReferences(input.text, text, input.references), reference].sort(
      (left, right) => left.start - right.start,
    ),
    selection,
  };
}
export function removedReference(input: ReferenceText, item: AiMessageReference): ReferenceText {
  const text = input.text.slice(0, item.start) + input.text.slice(item.end);
  return { text, references: adjustedReferences(input.text, text, input.references) };
}

export function requestsReferences(text: string): boolean {
  return /(?:^|\s)@/u.test(text);
}
