import { useDeferredValue, useRef, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { TextRange } from '../../../components/highlighted';
import type { FileAbilities } from '../source/abilities';
import type {
  FileLocation,
  FileNode,
  FileSearch,
  FileSource,
  FolderListing,
  SearchMatch,
  SearchQuery,
} from '../source/types';
import type { BrowserAction, BrowserFilter } from './browser-state';
import {
  asksSource,
  contentHitsOf,
  countLabelOf,
  filterCountOf,
  filterMatchesOf,
  filterTotalOf,
  filterWordsOf,
  highlightOf,
  kindChipsOf,
  mergeMatches,
  narrowNodes,
  nodesOfKind,
  scannedLineOf,
  searchStateOf,
  shownNodes,
  statusLineOf,
  type ContentHit,
  type FilterMatch,
  type FilterCount,
  type FilterMatchOption,
  type KindChip,
  type SearchState,
} from './filter-model';

export interface BrowserFilterView {
  readonly text: string;
  readonly words: readonly string[];
  readonly active: boolean;
  readonly match: FilterMatch;
  readonly matchOptions: readonly FilterMatchOption[];
  readonly kinds: readonly KindChip[];
  readonly countLabel: string | null;
  readonly statusLine: string | null;
  readonly scannedLine: string | null;
  readonly search: SearchState;
  readonly hits: ReadonlyMap<string, ContentHit>;
  readonly stop: (() => void) | null;
  readonly more: (() => void) | null;
  readonly inputRef: RefObject<TextInput | null>;
  readonly highlight: (name: string) => TextRange | null;
  readonly setText: (text: string) => void;
  readonly setMatch: (match: FilterMatch) => void;
  readonly focus: () => void;
}

export interface FilterInput<O> {
  readonly source: FileSource<O>;
  readonly location: FileLocation;
  readonly abilities: FileAbilities;
  readonly listing: FolderListing<O>;
  readonly filter: BrowserFilter;
  readonly showHidden: boolean;
  readonly dispatch: (action: BrowserAction) => void;
}

export interface FilteredNodes<O> {
  readonly visible: readonly FileNode<O>[];
  readonly hiddenOnly: boolean;
  readonly filter: BrowserFilterView;
}

interface SourceSearch<O> {
  readonly match: FilterMatch;
  readonly asked: boolean;
  readonly search: FileSearch<O>;
  readonly state: SearchState;
}

const NO_HITS: ReadonlyMap<string, ContentHit> = new Map();

function matchOf(filter: BrowserFilter, abilities: FileAbilities): FilterMatch {
  return abilities.searchContents ? filter.match : 'names';
}

function queryOf(text: string, match: FilterMatch, asked: boolean): SearchQuery | null {
  return asked ? { text, contents: match === 'contents' } : null;
}

function shownOf<O>(input: FilterInput<O>, nodes: readonly FileNode<O>[]): readonly FileNode<O>[] {
  return shownNodes(nodes, input.showHidden || !input.abilities.hidden);
}

function ofKind<O>(input: FilterInput<O>, nodes: readonly FileNode<O>[]): readonly FileNode<O>[] {
  return input.abilities.kindFilter ? nodesOfKind(nodes, input.filter.kind) : nodes;
}

function shownMatches<O>(
  input: FilterInput<O>,
  matches: readonly SearchMatch<O>[],
): readonly SearchMatch<O>[] {
  const kept = new Set(
    shownOf(
      input,
      matches.map((match) => match.node),
    ).map((node) => node.key),
  );
  return matches.filter((match) => kept.has(match.node.key));
}

function useSourceSearch<O>(input: FilterInput<O>, words: readonly string[]): SourceSearch<O> {
  const match = matchOf(input.filter, input.abilities);
  const deferred = useDeferredValue(input.filter.text);
  const asked = input.abilities.searchNames && asksSource(words, input.listing.complete, match);
  const search = input.source.useSearch(input.location, queryOf(deferred, match, asked));
  const state = searchStateOf({
    asked,
    online: input.abilities.searchNames,
    running: search.running || deferred !== input.filter.text,
    failed: search.error !== null && search.error !== undefined,
    more: search.more !== null,
  });
  return { match, asked, search, state };
}

function countOf<O>(input: FilterInput<O>, shown: number, found: SourceSearch<O>): FilterCount {
  const { listing } = input;
  return filterCountOf({
    shown,
    asked: found.asked,
    search: found.state,
    complete: listing.complete,
    folderTotal: filterTotalOf(listing.folder, shownOf(input, listing.entries), listing.complete),
  });
}

function countLines<O>(
  count: FilterCount,
  found: SourceSearch<O>,
): Pick<BrowserFilterView, 'countLabel' | 'statusLine'> {
  return {
    countLabel: countLabelOf(count),
    statusLine: statusLineOf(found.state, count, found.match),
  };
}

function searchPartsOf<O>(
  found: SourceSearch<O>,
): Pick<BrowserFilterView, 'scannedLine' | 'stop' | 'more'> {
  const { asked, search } = found;
  return {
    scannedLine: asked ? scannedLineOf(search.scanned, search.running) : null,
    stop: asked ? search.stop : null,
    more: asked ? search.more : null,
  };
}

type FilterControls = Pick<BrowserFilterView, 'setText' | 'setMatch' | 'focus' | 'inputRef'>;

function useFilterControls(dispatch: (action: BrowserAction) => void): FilterControls {
  const inputRef = useRef<TextInput>(null);
  return {
    inputRef,
    setText: (text): void => {
      dispatch({ kind: 'filter', change: { text } });
    },
    setMatch: (match): void => {
      dispatch({ kind: 'filter', change: { match } });
    },
    focus: (): void => {
      inputRef.current?.focus();
    },
  };
}

function hiddenOnlyOf<O>(input: FilterInput<O>): boolean {
  const { entries } = input.listing;
  if (input.showHidden || !input.abilities.hidden || entries.length === 0) return false;
  return entries.every((node) => node.hidden);
}

export function useBrowserFilter<O>(input: FilterInput<O>): FilteredNodes<O> {
  const controls = useFilterControls(input.dispatch);
  const words = filterWordsOf(input.filter.text);
  const active = words.length > 0;
  const found = useSourceSearch(input, words);
  const base = shownOf(input, input.listing.entries);
  const extra = found.asked ? shownMatches(input, found.search.matches) : [];
  const hits = found.asked ? contentHitsOf(found.search.matches) : NO_HITS;
  const pool = active ? narrowNodes(mergeMatches(base, extra), words, hits) : base;
  const visible = ofKind(input, pool);
  const count = countOf(input, visible.length, found);
  const lines = countLines(count, found);
  return {
    visible,
    hiddenOnly: hiddenOnlyOf(input),
    filter: {
      text: input.filter.text,
      words,
      active,
      match: found.match,
      matchOptions: filterMatchesOf(input.abilities),
      kinds: kindChipsOf(pool, active ? count.final : input.listing.complete),
      countLabel: active ? lines.countLabel : null,
      statusLine: active ? lines.statusLine : null,
      search: found.state,
      hits,
      highlight: (name) => (active ? highlightOf(name, words) : null),
      ...searchPartsOf(found),
      ...controls,
    },
  };
}
