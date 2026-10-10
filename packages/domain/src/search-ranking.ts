import type { SearchEntry, SearchGroup, SearchIndex } from './search';
import { typedNumberEntries } from './search-index';

export interface RankOptions {
  readonly recent: Readonly<Record<string, number>>;
  readonly now: number;
  readonly limit: number;
}

export interface SearchHighlight {
  readonly start: number;
  readonly end: number;
}

export interface SearchResult {
  readonly entry: SearchEntry;
  readonly score: number;
  readonly highlight: SearchHighlight | null;
}

export const EXACT_SCORE = 100;

export const RECENCY_WEIGHT = 6;

const DAY_MS = 86_400_000;

const NAME_MATCH = 6;

const ROOM_NAME_BONUS = 3;

const GROUP_WEIGHT: Readonly<Record<SearchGroup, number>> = {
  action: 0,
  device: 1.5,
  room: 1,
  setting: 0.5,
  scene: 1,
  page: 1,
  automation: 0.5,
};

const FILLER_WORDS: ReadonlySet<string> = new Set(['a', 'an', 'the', 'for', 'my', 'please']);

export function tokensOf(query: string): string[] {
  return (query.toLowerCase().match(/\S+/g) ?? []).filter((token) => !FILLER_WORDS.has(token));
}

function wordsOf(text: string): string[] {
  return text.split(/[\s·—→,/()]/);
}

export function isSubsequence(needle: string, haystack: string): boolean {
  let found = 0;
  for (const character of haystack) {
    if (character === needle[found]) {
      found += 1;
    }
  }
  return found === needle.length;
}

export function tokenScore(token: string, title: string, extra: string): number {
  if (title.startsWith(token)) {
    return 8;
  }
  if (wordsOf(title).some((word) => word.startsWith(token))) {
    return 6;
  }
  if (title.includes(token)) {
    return 4;
  }
  if (wordsOf(extra).some((word) => word.startsWith(token))) {
    return 3;
  }
  if (extra.includes(token)) {
    return 2;
  }
  return isSubsequence(token, title) ? 1 : 0;
}

export function recencyBoost(usedAt: number | undefined, now: number): number {
  if (usedAt === undefined) {
    return 0;
  }
  return RECENCY_WEIGHT * 0.5 ** (Math.max(0, now - usedAt) / DAY_MS);
}

export function scoreEntry(
  entry: SearchEntry,
  tokens: readonly string[],
  options: RankOptions,
): number | null {
  const title = entry.title.toLowerCase();
  const extra = [entry.detail, ...entry.keywords].join(' ').toLowerCase();
  let total = title === tokens.join(' ') ? EXACT_SCORE : 0;
  let named = true;
  for (const token of tokens) {
    const score = tokenScore(token, title, extra);
    if (score === 0) {
      return null;
    }
    named &&= score >= NAME_MATCH;
    total += score;
  }
  const roomNamed = entry.group === 'room' && named ? ROOM_NAME_BONUS : 0;
  return (
    total +
    roomNamed +
    GROUP_WEIGHT[entry.group] +
    recencyBoost(options.recent[entry.id], options.now)
  );
}

function highlightOf(entry: SearchEntry, tokens: readonly string[]): SearchHighlight | null {
  const title = entry.title.toLowerCase();
  for (const token of tokens) {
    const start = title.indexOf(token);
    if (start >= 0) {
      return { start, end: start + token.length };
    }
  }
  return null;
}

export function numberIn(tokens: readonly string[]): number | null {
  for (const token of tokens) {
    const written = /^(-?\d+(?:\.\d+)?)(?:%|°c?|°f|k|w)?$/.exec(token)?.[1];
    if (written !== undefined) {
      return Number(written);
    }
  }
  return null;
}

function candidatesFor(index: SearchIndex, tokens: readonly string[]): readonly SearchEntry[] {
  const typed = numberIn(tokens);
  const known = new Set(index.entries.map((entry) => entry.id));
  return [
    ...index.entries,
    ...typedNumberEntries(index, typed).filter((entry) => !known.has(entry.id)),
  ];
}

type Accept = (entry: SearchEntry) => boolean;

function byScore(left: SearchResult, right: SearchResult): number {
  return right.score - left.score || left.entry.title.localeCompare(right.entry.title);
}

function suggestionsOf(index: SearchIndex, options: RankOptions, accept: Accept): SearchResult[] {
  return index.entries
    .filter((entry) => accept(entry) && (entry.suggested || options.recent[entry.id] !== undefined))
    .map((entry) => ({
      entry,
      score: recencyBoost(options.recent[entry.id], options.now) + (entry.suggested ? 1 : 0),
      highlight: null,
    }))
    .sort(byScore)
    .slice(0, options.limit);
}

function ranked(
  index: SearchIndex,
  tokens: readonly string[],
  options: RankOptions,
  accept: Accept,
): SearchResult[] {
  if (tokens.length === 0) {
    return suggestionsOf(index, options, accept);
  }
  const results: SearchResult[] = [];
  for (const entry of candidatesFor(index, tokens)) {
    const score = accept(entry) ? scoreEntry(entry, tokens, options) : null;
    if (score !== null) {
      results.push({ entry, score, highlight: highlightOf(entry, tokens) });
    }
  }
  return results.sort(byScore).slice(0, options.limit);
}

const ACTION_WORDS: ReadonlySet<string> = new Set([
  'turn',
  'switch',
  'set',
  'on',
  'off',
  'open',
  'close',
  'lock',
  'unlock',
  'start',
  'stop',
  'run',
  'mute',
  'unmute',
  'play',
  'pause',
  'resume',
  'dim',
  'enable',
  'disable',
  'press',
  'learn',
  'reset',
  'activate',
  'talk',
  'show',
]);

export function wantsActions(tokens: readonly string[]): boolean {
  return numberIn(tokens) !== null || tokens.some((token) => ACTION_WORDS.has(token));
}

function isGatedAction(entry: SearchEntry): boolean {
  return entry.group === 'action' && entry.open.kind !== 'camera';
}

export function rankSearch(
  index: SearchIndex,
  query: string,
  options: RankOptions,
): SearchResult[] {
  const tokens = tokensOf(query);
  const actions = wantsActions(tokens);
  return ranked(index, tokens, options, (entry) => actions || !isGatedAction(entry));
}
