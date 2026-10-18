import { randomUUID } from 'expo-crypto';
import type { AiMessageReference } from '@smarteverything/domain';
import { adjustedReferences, checkedReferenceText, type ReferenceText } from '../references/spans';
import type { Quote } from '../model/composer-state';
import { sameJson } from '../../../store/same-json';
import { aiDrafts, patchAiDrafts, useAiDrafts, type DraftSubmission } from './ai-drafts';
import { moveUploads } from './uploads';
import { useDerived } from './use-derived';

const NO_REFERENCES: readonly AiMessageReference[] = [];

function without<T>(all: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  return Object.fromEntries(Object.entries(all).filter(([name]) => name !== key));
}

export function useDraft(key: string): readonly [string, (text: string) => void] {
  const text = useAiDrafts((state) => state.drafts[key]?.text ?? '');
  const set = (next: string): void => {
    setDraft(key, next);
  };
  return [text, set];
}

export function draftText(key: string): string {
  return aiDrafts.get().drafts[key]?.text ?? '';
}

export function useDraftSelected<T>(
  key: string,
  select: (text: string) => T,
  equal: (left: T, right: T) => boolean = Object.is,
): T {
  return useDerived(aiDrafts.subscribe, () => select(draftText(key)), equal);
}

export function useQuote(key: string): readonly [Quote | null, (quote: Quote | null) => void] {
  const quote = useAiDrafts((state) => state.quotes[key] ?? null);
  const set = (next: Quote | null): void => {
    patchAiDrafts('quotes', (all) => (next === null ? without(all, key) : { ...all, [key]: next }));
  };
  return [quote, set];
}

export function quoteInto(key: string, quote: Quote): void {
  patchAiDrafts('quotes', (all) => ({ ...all, [key]: quote }));
}

export function setDraft(key: string, text: string): void {
  const before = aiDrafts.get().drafts[key];
  setReferenceDraft(key, {
    text,
    references: adjustedReferences(before?.text ?? '', text, before?.references ?? []),
  });
}

export function clearDraft(key: string): void {
  aiDrafts.update((state) => ({
    ...state,
    drafts: {
      ...state.drafts,
      [key]: {
        text: '',
        references: NO_REFERENCES,
        revision: (state.drafts[key]?.revision ?? 0) + 1,
      },
    },
    quotes: without(state.quotes, key),
  }));
}

export function draftRevision(key: string): number {
  return aiDrafts.get().drafts[key]?.revision ?? 0;
}

export function clearSubmittedDraft(key: string, revision: number, quote: Quote | null): void {
  if (draftRevision(key) === revision) setDraft(key, '');
  if (aiDrafts.get().quotes[key] === quote) patchAiDrafts('quotes', (all) => without(all, key));
}

export function moveDraft(from: string, to: string): void {
  const { drafts, quotes } = aiDrafts.get();
  const draft = drafts[from];
  const quote = quotes[from];
  if (draft !== undefined) setReferenceDraft(to, draft, draft.submission);
  if (quote !== undefined) quoteInto(to, quote);
  patchAiDrafts('drafts', (all) => without(all, from));
  patchAiDrafts('quotes', (all) => without(all, from));
  moveUploads(from, to);
}

export function useDraftReferences(key: string): readonly AiMessageReference[] {
  return useDerived(
    aiDrafts.subscribe,
    () => aiDrafts.get().drafts[key]?.references ?? NO_REFERENCES,
    sameJson,
  );
}

export function setReferenceDraft(
  key: string,
  input: ReferenceText,
  submission?: DraftSubmission,
): void {
  const checked = checkedReferenceText(input);
  const value =
    checked.references.length === 0 ? { ...checked, references: NO_REFERENCES } : checked;
  patchAiDrafts('drafts', (all) => ({
    ...all,
    [key]: {
      ...value,
      revision: (all[key]?.revision ?? 0) + 1,
      ...(submission === undefined ? {} : { submission }),
    },
  }));
}

export function captureDraftSubmission(
  key: string,
  text: string,
  attachments: readonly string[],
  references: readonly AiMessageReference[],
): DraftSubmission {
  const payload = JSON.stringify([text, attachments, references]);
  const draft = aiDrafts.get().drafts[key];
  if (draft?.submission?.payload === payload) return draft.submission;
  const submission = { id: randomUUID(), payload };
  const value = draft ?? { text: '', references: [], revision: 0 };
  patchAiDrafts('drafts', (all) => ({ ...all, [key]: { ...value, submission } }));
  return submission;
}

export function draftQuote(key: string): Quote | null {
  return aiDrafts.get().quotes[key] ?? null;
}
