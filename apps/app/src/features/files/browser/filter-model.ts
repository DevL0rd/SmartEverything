import type { TextRange } from '../../../components/highlighted';
import { count } from '../../../format/number';
import { plural } from '../../../format/text';
import type { FileAbilities } from '../source/abilities';
import type { FileHit, FileNode, FileNodeKind, HitWhere, SearchMatch } from '../source/types';

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

const MARKS = /\p{M}/gu;

interface Folded {
  readonly text: string;
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

function fold(text: string): Folded {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const char of text) {
    const piece = char.normalize('NFD').replace(MARKS, '').toLowerCase();
    const units = { length: piece.length };
    starts.push(...Array.from(units, () => at));
    ends.push(...Array.from(units, () => at + char.length));
    folded += piece;
    at += char.length;
  }
  return { text: folded, starts, ends };
}

export function filterWordsOf(text: string): readonly string[] {
  return fold(text).text.match(WORD) ?? [];
}

function rangeOfWord(name: Folded, word: string): TextRange | null {
  for (const found of name.text.matchAll(WORD)) {
    if (found[0].startsWith(word)) {
      const start = name.starts[found.index];
      const end = name.ends[found.index + word.length - 1];
      return start === undefined || end === undefined ? null : { start, end };
    }
  }
  return null;
}

export function mergedRanges(ranges: readonly TextRange[]): readonly TextRange[] {
  const sorted = [...ranges].sort((first, second) => first.start - second.start);
  const out: TextRange[] = [];
  for (const range of sorted) {
    const last = out.at(-1);
    if (last !== undefined && range.start <= last.end) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
    } else {
      out.push(range);
    }
  }
  return out;
}

export function matchRangesOf(name: string, words: readonly string[]): readonly TextRange[] | null {
  if (words.length === 0) return null;
  const folded = fold(name);
  const ranges: TextRange[] = [];
  for (const word of words) {
    const range = rangeOfWord(folded, word);
    if (range === null) return null;
    ranges.push(range);
  }
  return mergedRanges(ranges);
}

export function highlightOf(name: string, words: readonly string[]): TextRange | null {
  return matchRangesOf(name, words)?.[0] ?? null;
}

export type FilterMatch = 'names' | 'contents';

export interface FilterMatchOption {
  readonly value: FilterMatch;
  readonly label: string;
}

const MATCH_OPTIONS: readonly FilterMatchOption[] = [
  { value: 'names', label: 'Names only' },
  { value: 'contents', label: 'Contents' },
];

export function filterMatchesOf(abilities: FileAbilities): readonly FilterMatchOption[] {
  return abilities.searchContents ? MATCH_OPTIONS : [];
}

export function asksSource(
  words: readonly string[],
  complete: boolean,
  match: FilterMatch,
): boolean {
  return words.length > 0 && (match === 'contents' || !complete);
}

export function mergeMatches<O>(
  loaded: readonly FileNode<O>[],
  found: readonly SearchMatch<O>[],
): readonly FileNode<O>[] {
  const known = new Set(loaded.map((node) => node.key));
  const extra = found.map((match) => match.node).filter((node) => !known.has(node.key));
  return extra.length === 0 ? loaded : [...loaded, ...extra];
}

export type ContentHit = FileHit & { readonly where: Exclude<HitWhere, 'name'> };

function isContentHit(hit: FileHit): hit is ContentHit {
  return hit.where !== 'name';
}

export function contentHitsOf<O>(
  matches: readonly SearchMatch<O>[],
): ReadonlyMap<string, ContentHit> {
  const found = new Map<string, ContentHit>();
  for (const { node, hit } of matches) {
    if (isContentHit(hit) && !found.has(node.key)) found.set(node.key, hit);
  }
  return found;
}

export function narrowNodes<O>(
  nodes: readonly FileNode<O>[],
  words: readonly string[],
  contentHits: ReadonlyMap<string, ContentHit>,
): readonly FileNode<O>[] {
  if (words.length === 0) return nodes;
  return nodes.filter(
    (node) => contentHits.has(node.key) || matchRangesOf(node.name, words) !== null,
  );
}

export const HIT_CHIP: Readonly<Record<ContentHit['where'], string>> = {
  text: 'In text',
  image_text: 'In image text',
};

export interface SnippetPart {
  readonly text: string;
  readonly marked: boolean;
}

export function snippetPartsOf(
  snippet: string,
  ranges: readonly TextRange[],
): readonly SnippetPart[] {
  const parts: SnippetPart[] = [];
  let at = 0;
  for (const range of mergedRanges(ranges)) {
    const start = Math.max(range.start, at);
    if (start > at) parts.push({ text: snippet.slice(at, start), marked: false });
    if (range.end > start) parts.push({ text: snippet.slice(start, range.end), marked: true });
    at = Math.max(at, range.end);
  }
  if (at < snippet.length) parts.push({ text: snippet.slice(at), marked: false });
  return parts.map((part) => ({ ...part, text: part.text.replace(/\s+/gu, ' ') }));
}

export function hitLineOf(hit: ContentHit): string {
  return hit.line === null
    ? HIT_CHIP[hit.where]
    : `${HIT_CHIP[hit.where]} · line ${count(hit.line)}`;
}

export type KindFilter = 'all' | FileNodeKind;

const KIND_ORDER: readonly FileNodeKind[] = [
  'folder',
  'image',
  'document',
  'video',
  'audio',
  'archive',
  'link',
  'special',
  'other',
];

const KIND_LABEL: Readonly<Record<FileNodeKind, string>> = {
  folder: 'Folders',
  image: 'Images',
  document: 'Documents',
  video: 'Videos',
  audio: 'Audio',
  archive: 'Archives',
  link: 'Links',
  special: 'Special files',
  other: 'Other',
};

export interface KindChip {
  readonly kind: KindFilter;
  readonly label: string;
  readonly count: number | null;
}

export function kindChipsOf(nodes: readonly FileNode[], complete: boolean): readonly KindChip[] {
  const counts = new Map<FileNodeKind, number>();
  for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  const present = KIND_ORDER.filter((kind) => counts.has(kind));
  return [
    { kind: 'all', label: 'All', count: complete ? nodes.length : null },
    ...present.map((kind) => ({
      kind,
      label: KIND_LABEL[kind],
      count: complete ? (counts.get(kind) ?? 0) : null,
    })),
  ];
}

export function nodesOfKind<O>(
  nodes: readonly FileNode<O>[],
  kind: KindFilter,
): readonly FileNode<O>[] {
  return kind === 'all' ? nodes : nodes.filter((node) => node.kind === kind);
}

export function shownNodes<O>(
  nodes: readonly FileNode<O>[],
  showHidden: boolean,
): readonly FileNode<O>[] {
  return showHidden ? nodes : nodes.filter((node) => !node.hidden);
}

export function filterTotalOf(
  folder: FileNode | null,
  loaded: readonly FileNode[],
  complete: boolean,
): number | null {
  if (complete) return loaded.length;
  return folder?.childCount ?? null;
}

export interface FilterCount {
  readonly shown: number;
  readonly total: number | null;
  readonly final: boolean;
}

export interface FilterCountInput {
  readonly shown: number;
  readonly asked: boolean;
  readonly search: SearchState;
  readonly complete: boolean;
  readonly folderTotal: number | null;
}

export function filterCountOf(input: FilterCountInput): FilterCount {
  const { shown, asked, search, complete } = input;
  if (asked) return { shown, total: null, final: search === 'done' };
  return { shown, total: input.folderTotal, final: isFinal(complete, search) };
}

export function countLabelOf({ shown, total, final }: FilterCount): string {
  const matched = final ? count(shown) : `${count(shown)}+`;
  return total === null ? `${matched} found` : `${matched} of ${count(total)}`;
}

export function hiddenLineOf({ shown, total, final }: FilterCount): string | null {
  if (!final || total === null || total <= shown) return null;
  return `${plural(total - shown, 'more item', 'more items')} hidden by the filter.`;
}

export function searchAllLabelOf(sourceLabel: string, text: string): string {
  return `Search all of ${sourceLabel} for “${text.trim()}”`;
}

export interface TypedPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const PRINTABLE = /^[\p{L}\p{N}\p{M}\p{P}\p{S}]$/u;

export function typedCharOf(
  press: TypedPress,
  reserved: boolean,
  editable: boolean,
): string | null {
  if (editable || reserved || press.ctrlKey || press.metaKey || press.altKey) return null;
  return PRINTABLE.test(press.key) ? press.key : null;
}

export type SearchState = 'unasked' | 'offline' | 'looking' | 'failed' | 'more' | 'done';

export interface SearchSignals {
  readonly asked: boolean;
  readonly online: boolean;
  readonly running: boolean;
  readonly failed: boolean;
  readonly more: boolean;
}

export function searchStateOf(signals: SearchSignals): SearchState {
  if (!signals.asked) return 'unasked';
  if (!signals.online) return 'offline';
  if (signals.failed) return 'failed';
  if (signals.running) return 'looking';
  return signals.more ? 'more' : 'done';
}

export function isFinal(complete: boolean, search: SearchState): boolean {
  return complete || search === 'done';
}

const SEARCH_LINES: Readonly<Record<FilterMatch, Readonly<Partial<Record<SearchState, string>>>>> =
  {
    names: {
      offline:
        'Only the part of this folder already shown was filtered. The rest is searched when the connection is back.',
      failed: 'The rest of this folder could not be searched.',
      looking: 'Looking through the rest of this folder…',
      more: 'More of this folder may match.',
    },
    contents: {
      offline:
        'Only names were filtered. Text inside files is searched when the connection is back.',
      failed: 'The text inside these files could not be searched.',
      looking: 'Looking inside the files in this folder…',
      more: 'More files in this folder may match.',
    },
  };

export function statusLineOf(
  search: SearchState,
  filterCount: FilterCount,
  match: FilterMatch,
): string | null {
  return SEARCH_LINES[match][search] ?? hiddenLineOf(filterCount);
}

export function scannedLineOf(scanned: number | null, running: boolean): string | null {
  if (scanned === null) return null;
  const files = scanned === 1 ? '1 file' : `${count(scanned)} files`;
  return running ? `Searched ${files} so far` : `Searched ${files}`;
}

export interface PlainSnippet {
  readonly snippet: string;
  readonly ranges: readonly TextRange[];
}

export function plainSnippetOf(marked: string, open: string, close: string): PlainSnippet {
  let snippet = '';
  let start: number | null = null;
  const ranges: TextRange[] = [];
  for (const char of marked) {
    if (char === open) {
      start = snippet.length;
    } else if (char === close) {
      if (start !== null && snippet.length > start) ranges.push({ start, end: snippet.length });
      start = null;
    } else {
      snippet += char;
    }
  }
  if (start !== null && snippet.length > start) ranges.push({ start, end: snippet.length });
  return { snippet, ranges };
}
