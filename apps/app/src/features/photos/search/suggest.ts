import type {
  PhotoBox,
  PhotoGroupKind,
  PhotoSuggestions,
  PlaceCountry,
} from '@smarteverything/domain';
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

export interface SuggestionFace {
  readonly itemId: string;
  readonly box: PhotoBox | null;
  readonly kind: PhotoGroupKind;
}

export interface Suggestion {
  readonly token: SearchToken;
  readonly count: number | null;
  readonly face?: SuggestionFace;
  readonly detail?: string;
}

export interface SmartHits {
  readonly suggestions: PhotoSuggestions | null;
  readonly boxes: ReadonlyMap<string, PhotoBox>;
}

export const NO_SMART_HITS: SmartHits = { suggestions: null, boxes: new Map() };

export type SuggestionGroupId =
  'people' | 'pets' | 'places' | 'dates' | 'things' | 'text' | 'albums' | 'cameras' | 'kinds';

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

function groupHits(smart: SmartHits, kind: PhotoGroupKind): readonly Suggestion[] {
  const found = kind === 'pet' ? smart.suggestions?.pets : smart.suggestions?.people;
  return (found ?? []).map((group) => ({
    token: { kind, groupId: group.groupId, label: group.name },
    count: group.count,
    face: { itemId: group.coverItemId, box: smart.boxes.get(group.groupId) ?? null, kind },
  }));
}

function thingHits(smart: SmartHits): readonly Suggestion[] {
  return (smart.suggestions?.things ?? []).map((thing) => ({
    token: { kind: 'thing' as const, label: thing.label },
    count: thing.count,
  }));
}

function textHits(smart: SmartHits, text: string): readonly Suggestion[] {
  const first = smart.suggestions?.text[0];
  const words = text.trim();
  if (first === undefined || words === '') return [];
  return [
    {
      token: { kind: 'photoText', text: words, label: `Text “${words}”` },
      count: null,
      detail: first.snippet,
    },
  ];
}

export function suggestionsOf(
  text: string,
  sources: SearchSources,
  held: readonly SearchToken[],
  smart: SmartHits,
): readonly SuggestionGroup[] {
  const query = foldText(text);
  if (query === '') return [];
  const groups: readonly SuggestionGroup[] = [
    { id: 'people', title: 'People', items: groupHits(smart, 'person') },
    { id: 'pets', title: 'Pets', items: groupHits(smart, 'pet') },
    { id: 'places', title: 'Places', items: placeHits(sources, query) },
    { id: 'dates', title: 'Dates', items: dateSuggestionsOf(text, sources.dates) },
    { id: 'things', title: 'Things', items: thingHits(smart) },
    { id: 'text', title: 'Text in photos', items: textHits(smart, text) },
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
