import { randomUUID } from 'expo-crypto';
import { ValueStore, useValue } from '../../../design/external-store';
import type { AiMessageReference } from '@smarteverything/domain';
import { adjustedReferences, checkedReferenceText, type ReferenceText } from '../references/spans';
import type { Quote } from '../model/composer-state';
interface Draft {
  readonly text: string;
  readonly revision: number;
  readonly references: readonly AiMessageReference[];
  readonly submission?: DraftSubmission;
}
const drafts = new ValueStore<Readonly<Record<string, Draft>>>({});
const quotes = new ValueStore<Readonly<Record<string, Quote>>>({});

export function useDraft(key: string): readonly [string, (text: string) => void] {
  const text = useValue(drafts)[key]?.text ?? '';
  const set = (next: string): void => {
    setDraft(key, next);
  };
  return [text, set];
}

export function useQuote(key: string): readonly [Quote | null, (quote: Quote | null) => void] {
  const quote = useValue(quotes)[key] ?? null;
  const set = (next: Quote | null): void => {
    quotes.update((all) => {
      const rest = Object.fromEntries(Object.entries(all).filter(([name]) => name !== key));
      return next === null ? rest : { ...rest, [key]: next };
    });
  };
  return [quote, set];
}

export function quoteInto(key: string, quote: Quote): void {
  quotes.update((all) => ({ ...all, [key]: quote }));
}

export function setDraft(key: string, text: string): void {
  const before = drafts.get()[key];
  setReferenceDraft(key, {
    text,
    references: adjustedReferences(before?.text ?? '', text, before?.references ?? []),
  });
}

export function draftRevision(key: string): number {
  return drafts.get()[key]?.revision ?? 0;
}

export function clearSubmittedDraft(key: string, revision: number, quote: Quote | null): void {
  if (draftRevision(key) === revision) setDraft(key, '');
  if (quotes.get()[key] === quote)
    quotes.update((all) =>
      Object.fromEntries(Object.entries(all).filter(([name]) => name !== key)),
    );
}

export function moveDraft(from: string, to: string): void {
  const draft = drafts.get()[from];
  const quote = quotes.get()[from];
  if (draft !== undefined) setReferenceDraft(to, draft, draft.submission);
  if (quote !== undefined) quoteInto(to, quote);
  drafts.update((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== from)));
  quotes.update((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== from)));
}

export function useDraftReferences(key: string): readonly AiMessageReference[] {
  return useValue(drafts)[key]?.references ?? [];
}
export function setReferenceDraft(
  key: string,
  input: ReferenceText,
  submission?: DraftSubmission,
): void {
  const value = checkedReferenceText(input);
  drafts.update((all) => ({
    ...all,
    [key]: {
      ...value,
      revision: (all[key]?.revision ?? 0) + 1,
      ...(submission === undefined ? {} : { submission }),
    },
  }));
}

export interface DraftSubmission {
  readonly id: string;
  readonly payload: string;
}
export function captureDraftSubmission(
  key: string,
  text: string,
  attachments: readonly string[],
  references: readonly AiMessageReference[],
): DraftSubmission {
  const payload = JSON.stringify([text, attachments, references]);
  const draft = drafts.get()[key];
  if (draft?.submission?.payload === payload) return draft.submission;
  const submission = { id: randomUUID(), payload };
  const value = draft ?? { text: '', references: [], revision: 0 };
  drafts.update((all) => ({ ...all, [key]: { ...value, submission } }));
  return submission;
}

export function draftQuote(key: string): Quote | null {
  return quotes.get()[key] ?? null;
}
