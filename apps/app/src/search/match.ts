import {
  loweredText,
  loweredTokenScore,
  numberIn,
  scoreLowered,
  type LoweredText,
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

function exact(lowered: LoweredText, tokens: readonly string[]): boolean {
  return tokens.every((token) => loweredTokenScore(token, lowered) > FUZZY_ONLY);
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

interface Candidate {
  readonly entry: SearchEntry;
  readonly plain: SearchEntry;
  readonly lowered: LoweredText;
}

interface Prepared {
  readonly known: ReadonlySet<string>;
  readonly all: readonly Candidate[];
}

function candidateOf(entry: SearchEntry): Candidate {
  const plain = comparable(entry);
  return { entry, plain, lowered: loweredText(plain) };
}

const prepared = new WeakMap<SearchIndex, Prepared>();

function preparedOf(index: SearchIndex): Prepared {
  const cached = prepared.get(index);
  if (cached !== undefined) {
    return cached;
  }
  const built: Prepared = {
    known: new Set(index.entries.map((entry) => entry.id)),
    all: index.entries.map(candidateOf),
  };
  prepared.set(index, built);
  return built;
}

function candidatesOf(index: SearchIndex, tokens: readonly string[]): readonly Candidate[] {
  const { known, all } = preparedOf(index);
  const typed = typedNumberEntries(index, numberIn(tokens))
    .filter((entry) => !known.has(entry.id))
    .map(candidateOf);
  return typed.length === 0 ? all : [...all, ...typed];
}

export function matchIndex(index: SearchIndex, query: string): Matched {
  const tokens = tokensOf(joined(query));
  const hits = new Map<string, EntryHit>();
  if (tokens.length === 0) {
    return { tokens, hits };
  }
  for (const { entry, plain, lowered } of candidatesOf(index, tokens)) {
    const score = scoreLowered(plain, lowered, tokens, PLAIN);
    if (score !== null && (tokens.length === 1 || exact(lowered, tokens))) {
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
