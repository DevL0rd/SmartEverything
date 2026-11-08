import type { PlaceCountry } from '@smarteverything/domain';
import { dateSuggestionsOf, type DateContext } from './dates';
import { hasToken, type SearchToken } from './tokens';

export interface SearchCamera {
  readonly make: string | null;
  readonly model: string | null;
  readonly items: number;
}

export interface SearchAlbum {
  readonly id: string;
  readonly title: string;
  readonly itemCount: number;
}

export interface SearchSources {
  readonly countries: readonly PlaceCountry[];
  readonly albums: readonly SearchAlbum[];
  readonly cameras: readonly SearchCamera[];
  readonly photos: number | null;
  readonly videos: number | null;
  readonly favourites: number | null;
  readonly dates: DateContext;
}

export interface Suggestion {
  readonly token: SearchToken;
  readonly count: number | null;
}

export type SuggestionGroupId = 'places' | 'dates' | 'albums' | 'cameras' | 'kinds';

export interface SuggestionGroup {
  readonly id: SuggestionGroupId;
  readonly title: string;
  readonly items: readonly Suggestion[];
}

export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function matchesQuery(label: string, query: string): boolean {
  const folded = foldText(label);
  return (
    folded.startsWith(query) ||
    folded.split(/[\s,.\-/]+/).some((word) => word !== '' && word.startsWith(query))
  );
}

export function cameraLabelOf(camera: SearchCamera): string | null {
  const make = camera.make?.trim() ?? '';
  const model = camera.model?.trim() ?? '';
  if (model === '') return make === '' ? null : make;
  if (make === '' || foldText(model).startsWith(foldText(make))) return model;
  return `${make} ${model}`;
}

function placeHits(sources: SearchSources, query: string): readonly Suggestion[] {
  return sources.countries.flatMap((country) => [
    ...(matchesQuery(country.country, query)
      ? [
          {
            token: {
              kind: 'country' as const,
              countryCode: country.countryCode,
              label: country.country,
            },
            count: country.count,
          },
        ]
      : []),
    ...country.places
      .filter((place) => matchesQuery(place.name, query))
      .map((place) => ({
        token: {
          kind: 'place' as const,
          placeId: place.id,
          label: `${place.name}, ${place.country}`,
        },
        count: place.count,
      })),
  ]);
}

function albumHits(sources: SearchSources, query: string): readonly Suggestion[] {
  return sources.albums
    .filter((album) => matchesQuery(album.title, query))
    .map((album) => ({
      token: { kind: 'album' as const, albumId: album.id, label: album.title },
      count: album.itemCount,
    }));
}

function cameraHits(sources: SearchSources, query: string): readonly Suggestion[] {
  return sources.cameras.flatMap((camera) => {
    const label = cameraLabelOf(camera);
    return label !== null && matchesQuery(label, query)
      ? [{ token: { kind: 'camera' as const, label }, count: camera.items }]
      : [];
  });
}

function kindHits(sources: SearchSources, query: string): readonly Suggestion[] {
  const kinds: readonly Suggestion[] = [
    { token: { kind: 'media', media: 'image', label: 'Photos' }, count: sources.photos },
    { token: { kind: 'media', media: 'video', label: 'Videos' }, count: sources.videos },
    { token: { kind: 'favourites', label: 'Favourites' }, count: sources.favourites },
  ];
  return kinds.filter((kind) => kind.count !== 0 && matchesQuery(kind.token.label, query));
}

export function suggestionsOf(
  text: string,
  sources: SearchSources,
  held: readonly SearchToken[],
): readonly SuggestionGroup[] {
  const query = foldText(text);
  if (query === '') return [];
  const groups: readonly SuggestionGroup[] = [
    { id: 'places', title: 'Places', items: placeHits(sources, query) },
    { id: 'dates', title: 'Dates', items: dateSuggestionsOf(text, sources.dates) },
    { id: 'albums', title: 'Albums', items: albumHits(sources, query) },
    { id: 'cameras', title: 'Cameras', items: cameraHits(sources, query) },
    { id: 'kinds', title: 'Kinds', items: kindHits(sources, query) },
  ];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !hasToken(held, item.token)),
    }))
    .filter((group) => group.items.length > 0);
}

export function flatSuggestions(groups: readonly SuggestionGroup[]): readonly Suggestion[] {
  return groups.flatMap((group) => group.items);
}
