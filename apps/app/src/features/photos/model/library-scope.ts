import type { LibraryFilter, LibraryScope, PhotoSource } from '@smarteverything/domain';
import type { SourceSearch } from '../../../api/photos';
import { typedTextOf, type SearchInput } from '../search/query';
import type { SearchToken } from '../search/tokens';
import type { LibraryTab } from './library-tabs';

export interface TabUse {
  readonly unused: readonly SearchToken[];
}

export type TabQuery =
  | (TabUse & { readonly kind: 'hub'; readonly scope: LibraryScope })
  | (TabUse & {
      readonly kind: 'source';
      readonly source: PhotoSource;
      readonly search: SourceSearch;
    })
  | (TabUse & { readonly kind: 'device'; readonly search: SourceSearch });

function filterOf(token: SearchToken): LibraryFilter | null {
  if (token.kind === 'favourites') return 'favourites';
  return token.kind === 'media' && token.media === 'video' ? 'videos' : null;
}

function firstOf(
  tokens: readonly SearchToken[],
  kind: SearchToken['kind'],
): SearchToken | undefined {
  return tokens.find((token) => token.kind === kind);
}

type Narrowing = Omit<LibraryScope, 'filter' | 'text'>;

function narrowingOf(token: SearchToken): Narrowing {
  switch (token.kind) {
    case 'place':
      return { placeId: token.placeId };
    case 'country':
      return { countryCode: token.countryCode };
    case 'camera':
      return { camera: token.label };
    case 'album':
      return { albumId: token.albumId };
    case 'date':
      return { from: token.from, to: token.to };
    case 'media':
    case 'favourites':
      return {};
  }
}

const NARROWING_KINDS = ['place', 'country', 'camera', 'album', 'date'] as const;

function hubQuery(tabFilter: LibraryFilter, input: SearchInput): TabQuery {
  const { tokens } = input;
  const used = NARROWING_KINDS.map((kind) => firstOf(tokens, kind)).filter(
    (token): token is SearchToken => token !== undefined,
  );
  const claimed = tokens.map(filterOf).find((filter) => filter !== null) ?? 'all';
  const filter = tabFilter === 'all' ? claimed : tabFilter;
  const text = typedTextOf(input);
  return {
    kind: 'hub',
    scope: {
      filter,
      ...used.reduce<Narrowing>(
        (narrowing, token) => ({ ...narrowing, ...narrowingOf(token) }),
        {},
      ),
      ...(text === null ? {} : { text }),
    },
    unused: tokens.filter(
      (token) => !used.includes(token) && (filter === 'all' || filterOf(token) !== filter),
    ),
  };
}

export function textAndDatesOf(input: SearchInput): {
  readonly search: SourceSearch;
  readonly unused: readonly SearchToken[];
} {
  const date = input.tokens.find((token) => token.kind === 'date');
  const dated = date?.kind === 'date' ? date : null;
  return {
    search: { text: typedTextOf(input), from: dated?.from ?? null, to: dated?.to ?? null },
    unused: input.tokens.filter((token) => token !== dated),
  };
}

export function scopeOf(tab: LibraryTab, input: SearchInput): TabQuery {
  if (tab.kind === 'hub') return hubQuery(tab.filter, input);
  const { search, unused } = textAndDatesOf(input);
  if (tab.kind === 'source') return { kind: 'source', source: tab.source, search, unused };
  return { kind: 'device', search, unused };
}
