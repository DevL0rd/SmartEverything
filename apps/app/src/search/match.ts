import {
  numberIn,
  scoreEntry,
  tokenScore,
  tokensOf,
  typedNumberEntries,
  type SearchEntry,
  type SearchIndex,
} from '@smarteverything/domain';
import type { TextRange } from '../components/highlighted';

export interface EntryHit {
  readonly entry: SearchEntry;
  readonly score: number;
}

export interface Matched {
  readonly tokens: readonly string[];
  readonly hits: ReadonlyMap<string, EntryHit>;
}

const FUZZY_ONLY = 1;

const PLAIN = { recent: {}, now: 0, limit: 0 };

function exact(entry: SearchEntry, tokens: readonly string[]): boolean {
  const title = entry.title.toLowerCase();
  const extra = [entry.detail, ...entry.keywords].join(' ').toLowerCase();
  return tokens.every((token) => tokenScore(token, title, extra) > FUZZY_ONLY);
}

const JOINERS = /[-‐‑]/g;

function joined(text: string): string {
  return text.replace(JOINERS, '');
}

function comparable(entry: SearchEntry): SearchEntry {
  return {
    ...entry,
    title: joined(entry.title),
    detail: joined(entry.detail),
    keywords: entry.keywords.map(joined),
  };
}

function candidatesOf(index: SearchIndex, tokens: readonly string[]): readonly SearchEntry[] {
  const known = new Set(index.entries.map((entry) => entry.id));
  const typed = typedNumberEntries(index, numberIn(tokens)).filter((entry) => !known.has(entry.id));
  return [...index.entries, ...typed];
}

export function matchIndex(index: SearchIndex, query: string): Matched {
  const tokens = tokensOf(joined(query));
  const hits = new Map<string, EntryHit>();
  if (tokens.length === 0) {
    return { tokens, hits };
  }
  for (const entry of candidatesOf(index, tokens)) {
    const plain = comparable(entry);
    const score = scoreEntry(plain, tokens, PLAIN);
    if (score !== null && (tokens.length === 1 || exact(plain, tokens))) {
      hits.set(entry.id, { entry, score });
    }
  }
  return { tokens, hits };
}

export function rangeIn(text: string, tokens: readonly string[], context = ''): TextRange | null {
  const lower = text.toLowerCase();
  const known = context.toLowerCase();
  const ordered = [
    ...tokens.filter((token) => !known.includes(token)),
    ...tokens.filter((token) => known.includes(token)),
  ];
  for (const token of ordered) {
    const start = lower.indexOf(token);
    if (start >= 0) {
      return { start, end: start + token.length };
    }
  }
  return null;
}
