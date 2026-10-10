import { ValueStore, useValue } from '../../../design/external-store';
import type { Quote } from '../model/composer-state';

const drafts = new ValueStore<Readonly<Record<string, string>>>({});

const quotes = new ValueStore<Readonly<Record<string, Quote>>>({});

export function useDraft(key: string): readonly [string, (text: string) => void] {
  const text = useValue(drafts)[key] ?? '';
  const set = (next: string): void => {
    drafts.update((all) => ({ ...all, [key]: next }));
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
  drafts.update((all) => ({ ...all, [key]: text }));
}
