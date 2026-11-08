import type { DriveItem, DriveQuery, SmartRule } from '@smarteverything/domain';
import type { TextRange } from '../../../components/highlighted';
import { count } from '../../../format/number';
import { plural } from '../../../format/text';

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

function merged(ranges: readonly TextRange[]): readonly TextRange[] {
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
  return merged(ranges);
}

export function highlightOf(name: string, words: readonly string[]): TextRange | null {
  return matchRangesOf(name, words)?.[0] ?? null;
}

export function narrowItems(
  items: readonly DriveItem[],
  words: readonly string[],
): readonly DriveItem[] {
  if (words.length === 0) return items;
  return items.filter((item) => matchRangesOf(item.name, words) !== null);
}

export interface FilterPlace {
  readonly rootId: string;
  readonly folderId: string | null;
}

export function asksHub(words: readonly string[], complete: boolean): boolean {
  return words.length > 0 && !complete;
}

export function hubQueryOf(text: string, place: FilterPlace): Omit<DriveQuery, 'cursor'> {
  const trimmed = text.trim();
  return {
    text: trimmed === '' ? null : trimmed,
    rootId: place.rootId,
    folderId: place.folderId,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'name', direction: 'asc' },
  };
}

export function childrenOf(items: readonly DriveItem[], place: FilterPlace): readonly DriveItem[] {
  return items.filter((item) => item.rootId === place.rootId && item.parentId === place.folderId);
}

export function mergeMatches(
  loaded: readonly DriveItem[],
  found: readonly DriveItem[],
): readonly DriveItem[] {
  const known = new Set(loaded.map((item) => item.id));
  const extra = found.filter((item) => !known.has(item.id));
  return extra.length === 0 ? loaded : [...loaded, ...extra];
}

export function filterTotalOf(
  folder: DriveItem | null,
  loaded: readonly DriveItem[],
  complete: boolean,
): number | null {
  if (complete) return loaded.length;
  return folder?.kind === 'folder' ? folder.childCount : null;
}

export interface FilterCount {
  readonly shown: number;
  readonly total: number | null;
  readonly final: boolean;
}

export function countLabelOf({ shown, total, final }: FilterCount): string {
  const matched = final ? count(shown) : `${count(shown)}+`;
  return total === null ? `${matched} found` : `${matched} of ${count(total)}`;
}

export function hiddenLineOf({ shown, total, final }: FilterCount): string | null {
  if (!final || total === null || total <= shown) return null;
  const hidden = total - shown;
  return `${plural(hidden, 'more item', 'more items')} hidden by the filter.`;
}

export function searchAllLabelOf(text: string): string {
  return `Search all of Drive for “${text.trim()}”`;
}

export function smartRuleOf(text: string, place: FilterPlace): SmartRule {
  return {
    match: 'all',
    rules: [
      { kind: 'text', field: 'name', contains: text.trim() },
      place.folderId === null
        ? { kind: 'in_root', rootId: place.rootId }
        : { kind: 'in_folder', folderId: place.folderId },
    ],
  };
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

export type HubState = 'unasked' | 'offline' | 'looking' | 'failed' | 'more' | 'done';

export interface HubSignals {
  readonly asked: boolean;
  readonly online: boolean;
  readonly fetching: boolean;
  readonly failed: boolean;
  readonly more: boolean;
}

export function hubStateOf(signals: HubSignals): HubState {
  if (!signals.asked) return 'unasked';
  if (!signals.online) return 'offline';
  if (signals.failed) return 'failed';
  if (signals.fetching) return 'looking';
  return signals.more ? 'more' : 'done';
}

export function isFinal(complete: boolean, hub: HubState): boolean {
  return complete || hub === 'done';
}

const HUB_LINES: Readonly<Partial<Record<HubState, string>>> = {
  offline:
    'Only the part of this folder already shown was filtered. The rest is searched when the hub is back.',
  failed: 'The rest of this folder could not be searched.',
  looking: 'Looking through the rest of this folder…',
  more: 'More of this folder may match.',
};

export function statusLineOf(hub: HubState, filterCount: FilterCount): string | null {
  return HUB_LINES[hub] ?? hiddenLineOf(filterCount);
}
